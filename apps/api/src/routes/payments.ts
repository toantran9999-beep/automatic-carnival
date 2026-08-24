import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, or, inArray, desc, gte, lte, gt, sql, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { createPaymentRequestSchema, createPaymentSchema, idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission, blockLiveOps } from "../middleware/rbac.js";
import { peruStartOfDay, peruEndOfDay } from "../lib/timezone.js";
import { buildVietQrPayload, resolveBankBin, bankDisplayName } from "@restai/config";
import { t } from "../lib/i18n.js";
import type { WsPrintTransferPayload } from "@restai/types";
import { wsManager } from "../ws/manager.js";
import { handleOrderCompletion, loadItemModifiers } from "../services/order.service.js";
import {
  createMomoPayment,
  verifyMomoIpnSignature,
  queryMomoTransaction,
  MOMO_MIN_VND,
  MOMO_MAX_VND,
  type MomoCredentials,
} from "../lib/momo.js";
import { logger } from "../lib/logger.js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const payments = new Hono<AppEnv>();
const PAYMENT_REQUEST_TTL_MS = 60 * 60 * 1000;

function centsToVnd(cents: number) {
  return Math.round(cents / 100);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function randomPaymentCode(orderNumber: string) {
  const cleanedOrder = orderNumber.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase() || "ORDER";
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TODA-${cleanedOrder}-${random}`;
}

function paymentSettings(branch: any) {
  const settings = (branch?.settings || {}) as Record<string, any>;
  return settings.payment?.sepay || settings.sepay || {};
}

/**
 * Khóa MoMo của MỘT chi nhánh. Mỗi chi nhánh một bộ khóa riêng — đừng gom về
 * biến môi trường, quán nhiều chi nhánh thì mỗi nơi một hợp đồng MoMo khác nhau.
 */
function momoSettings(branch: any): MomoCredentials & { enabled: boolean } {
  const cfg = ((branch?.settings || {}) as Record<string, any>).payment?.momo || {};
  return {
    enabled: Boolean(cfg.enabled),
    env: cfg.env === "production" ? "production" : "test",
    partnerCode: normalizeText(cfg.partner_code || cfg.partnerCode),
    accessKey: normalizeText(cfg.access_key || cfg.accessKey),
    secretKey: normalizeText(cfg.secret_key || cfg.secretKey),
  };
}

function hasMomoCredentials(m: { partnerCode: string; accessKey: string; secretKey: string }) {
  return Boolean(m.partnerCode && m.accessKey && m.secretKey);
}

function buildTransferPayload(branch: any, paymentCode: string, amount: number) {
  const sepay = paymentSettings(branch);
  const rawBankCode = normalizeText(sepay.bank_code || sepay.bankCode);
  const accountNumber = normalizeText(sepay.account_number || sepay.accountNumber);
  const accountName = normalizeText(sepay.account_name || sepay.accountName || branch?.name);
  const amountVnd = centsToVnd(amount);
  const addInfo = paymentCode;

  // Cấu hình có thể đang lưu tên ngân hàng ("Vietcombank") thay vì BIN — tự quy đổi.
  const bin = resolveBankBin(rawBankCode);
  const bankCode = bankDisplayName(bin, rawBankCode);

  // Chuỗi VietQR CHUẨN — đây mới là thứ máy in vẽ thành QR cho khách quét.
  // Tuyệt đối KHÔNG nhét link ảnh hay chuỗi tự chế vào đây: app ngân hàng sẽ
  // đọc ra và báo "Mã thanh toán không hợp lệ".
  const qrPayload = buildVietQrPayload({
    bin: bin || "",
    accountNumber,
    amountVnd,
    addInfo,
  });

  // Ảnh QR dựng sẵn của vietqr.io — chỉ dùng cho đường in bằng trình duyệt (<img>).
  const qrUrl =
    bin && accountNumber
      ? `https://img.vietqr.io/image/${bin}-${encodeURIComponent(accountNumber)}-compact2.png?${new URLSearchParams(
          { amount: String(amountVnd), addInfo, accountName },
        ).toString()}`
      : null;

  return {
    bankCode,
    bankBin: bin,
    accountNumber,
    accountName,
    addInfo,
    amountVnd,
    // Thiếu cấu hình ngân hàng → null, phiếu sẽ không in QR thay vì in mã hỏng.
    qrPayload,
    qrUrl,
  };
}

/**
 * Mọi mã TODA-… có thể có trong nội dung chuyển khoản.
 *
 * ⚠️ Đã đối chiếu với giao dịch THẬT ngày 31/07 — mỗi kênh chuyển tiền viết mã
 * một kiểu, và bản cũ (`/\bTODA-[A-Z0-9-]+\b/`) trượt 2 trong 4:
 *
 * | Nội dung thật                          | Bản cũ | Vì sao |
 * |----------------------------------------|--------|--------|
 * | `Ref MBVCB.…​.TODA-131-EDYSRQ.CT`       | ✅     |        |
 * | `Ref QR - TODA-67-LGDEM6#SP#…`          | ✅     |        |
 * | `…140012163644-0795436369_TODA-92-LX604S` | ❌  | `\b` đòi ranh giới từ, mà `_` LÀ ký tự từ |
 * | `Ref TODA512039P0#SP#…`                 | ❌     | kênh này XOÁ SẠCH gạch nối: `TODA-51-2039P0` → `TODA512039P0` |
 *
 * Nên: thay `\b` bằng lookbehind "không phải chữ/số" (cho phép `_`, `.`, `-`,
 * khoảng trắng, đầu chuỗi), và bỏ luôn yêu cầu phải có gạch nối ngay sau TODA.
 * Đòi ít nhất 2 ký tự phía sau để "HKD TODA CAFE" trong mọi thông báo không bị
 * nhận nhầm thành mã.
 */
function extractPaymentCodes(content: string): string[] {
  const found = content.toUpperCase().match(/(?<![A-Z0-9])TODA[-A-Z0-9]{2,}/g) || [];
  return Array.from(new Set(found));
}

function extractPaymentCode(content: string) {
  return extractPaymentCodes(content)[0] || "";
}

/** Bỏ gạch nối để so được mã đã bị kênh chuyển tiền làm phẳng. */
function stripCodeSeparators(code: string) {
  return code.replace(/-/g, "");
}

/**
 * Độ dài tối thiểu (sau khi bỏ gạch nối) để một mã được phép khớp bằng PHẦN ĐẦU.
 * Mã thật là TODA + số phiếu + 6 ký tự ngẫu nhiên nên ngắn nhất cũng 11 ký tự.
 */
const MIN_PREFIX_CODE_LEN = 10;

/**
 * Bao lâu không nghe thấy cầu nối thì coi là chết.
 *
 * Điện thoại gửi nhịp thở 5 phút một lần, nên 15 phút nghĩa là HỤT BA NHỊP LIỀN.
 * Đặt sát hơn thì một lần chập 4G đủ làm POS báo đỏ oan, mà báo đỏ oan vài lần
 * là nhân viên thôi không nhìn nữa.
 */
const BRIDGE_STALE_MINUTES = 15;

function webhookTransactionId(body: any) {
  return normalizeText(
    body.id ||
    body.transactionId ||
    body.transaction_id ||
    body.referenceCode ||
    body.reference_code ||
    body.gatewayTransactionId ||
    body.gateway_transaction_id,
  );
}

/**
 * Đọc số tiền VND từ một chuỗi do bên ngoài viết (JSON webhook hoặc chữ trong
 * thông báo đẩy của app ngân hàng).
 *
 * ⚠️ Đây là chỗ dễ mất tiền nhất trong cả hệ thống, và trước đây có HAI bản khác
 * nhau cùng làm việc này, sai theo hai kiểu ngược nhau:
 *  - Bản của cầu ngân hàng xóa sạch `.` và `,` → "+5,000.00 VND" thành 500.000đ,
 *    gấp 100 lần. Khâu chốt chỉ so "nhận >= phải trả" nên khách chuyển 5.000đ vẫn
 *    đóng được hóa đơn 50.000đ, mà sổ sách trông vẫn khớp.
 *  - Bản của webhook giữ lại `.` → "1.000.000" thành NaN → 0 → đơn treo vĩnh viễn.
 *
 * Quy tắc: `.` hoặc `,` đi kèm ĐÚNG 3 chữ số là dấu phân nghìn (bỏ); đi kèm 1-2
 * chữ số ở CUỐI chuỗi là phần thập phân (cắt bỏ, tiền Việt không dùng hào).
 *
 * Tự kiểm:
 *   "5,000.00" → 5000    "18.000"    → 18000
 *   "1.234.567" → 1234567  "1,000,000" → 1000000
 *   "50000"    → 50000   "18.000,50" → 18000
 */
export function parseVndAmount(raw: unknown): number {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s) return 0;
  // Phần thập phân: dấu cuối cùng còn 1-2 chữ số theo sau và không còn dấu nào nữa.
  s = s.replace(/[.,](\d{1,2})$/, "");
  // Còn lại đều là phân nghìn.
  s = s.replace(/[.,]/g, "");
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function webhookAmountCents(body: any) {
  const raw = body.transferAmount ?? body.transfer_amount ?? body.amount ?? body.value ?? 0;
  // Số JSON thuần (SePay gửi kiểu này) đi thẳng, khỏi qua bộ bóc chuỗi.
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100);
  return parseVndAmount(raw) * 100;
}

function webhookContent(body: any) {
  return normalizeText(
    body.content ||
    body.description ||
    body.transactionContent ||
    body.transaction_content ||
    body.referenceCode ||
    body.reference_code,
  );
}

/**
 * Ghi nhật ký đối soát cho MỘT nguồn tiền cụ thể.
 *
 * ⚠️ `provider` phải truyền vào, tuyệt đối không hardcode: bảng có unique
 * (provider, provider_transaction_id). Nếu ghi mọi nguồn thành "sepay" thì mã
 * giao dịch MoMo trùng mã SePay sẽ bị coi là đã xử lý và ÂM THẦM bỏ qua —
 * khách trả tiền mà đơn không bao giờ chốt.
 */
async function logWebhookEvent(data: {
  provider: string;
  providerTransactionId: string;
  paymentRequestId?: string | null;
  branchId?: string | null;
  amount: number;
  content: string;
  matched: boolean;
  reason: string;
  payload: unknown;
}) {
  /*
   * ⚠️ Để RÀNG BUỘC UNIQUE làm việc chống trùng, đừng SELECT rồi mới INSERT.
   *
   * Bản cũ hỏi trước rồi mới ghi — hai gói tin giống hệt tới cùng lúc thì cả hai
   * cùng hỏi, cùng thấy "chưa có", cùng ghi. Một cái sẽ đâm vào unique
   * (provider, provider_transaction_id) và NÉM LỖI ngược ra tay xử lý webhook.
   * `onConflictDoNothing` vừa hết đường đua vừa hết lỗi 500.
   */
  await db
    .insert(schema.paymentWebhookEvents)
    .values({
      provider: data.provider,
      provider_transaction_id: data.providerTransactionId || null,
      payment_request_id: data.paymentRequestId || null,
      branch_id: data.branchId || null,
      amount: data.amount,
      content: data.content,
      matched: data.matched,
      reason: data.reason,
      payload: data.payload as any,
    })
    .onConflictDoNothing();
}

/**
 * Ghi MỘT khoản thu tay (tiền mặt/thẻ) cho một đơn, có KHOÁ DÒNG ĐƠN.
 *
 * ⚠️ Đọc "đã trả bao nhiêu" rồi mới ghi mà không khoá là đúng cái lỗi đã làm
 * hỏng đường chuyển khoản: hai lượt cùng lúc cùng đọc thấy còn nợ đủ, cả hai
 * cùng ghi một khoản thu đủ. Thu ngân bấm hai lần thật nhanh trên màn cảm ứng
 * là ra y hệt. `FOR UPDATE` bắt lượt sau xếp hàng, đọc lại số dư đã cập nhật.
 *
 * Trả `null` khi đơn không còn gì để thu.
 */
async function insertManualPayment(args: {
  orderId: string;
  orderTotal: number;
  organizationId: string;
  branchId: string;
  method: any;
  want: number;
  reference?: string | null;
  tip: number;
}): Promise<{ payment: any; payAmount: number; previouslyPaid: number } | null> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM orders WHERE id = ${args.orderId} FOR UPDATE`);

    const [prev] = await tx
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.order_id, args.orderId),
          eq(schema.payments.status, "completed"),
        ),
      );

    const previouslyPaid = Number(prev?.total_paid || 0);
    const orderRemaining = args.orderTotal - previouslyPaid;
    if (orderRemaining <= 0) return null;

    const payAmount = Math.min(args.want, orderRemaining);

    const [payment] = await tx
      .insert(schema.payments)
      .values({
        order_id: args.orderId,
        organization_id: args.organizationId,
        branch_id: args.branchId,
        method: args.method,
        amount: payAmount,
        reference: args.reference ?? undefined,
        tip: args.tip,
        status: "completed",
      })
      .returning();

    return { payment, payAmount, previouslyPaid };
  });
}

async function completePaymentForOrder(tx: any, args: {
  orderId: string;
  organizationId: string;
  branchId: string;
  amount: number;
  reference?: string;
}) {
  const [order] = await tx
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, args.orderId), eq(schema.orders.branch_id, args.branchId)))
    .limit(1);

  if (!order) throw new Error("ORDER_NOT_FOUND");

  let amountToDistribute = args.amount;
  const paymentsCreated: any[] = [];
  // Đơn vừa chuyển completed trong tx — caller gọi handleOrderCompletion SAU khi commit
  // (handleOrderCompletion dùng db global, không được chạy trong tx này).
  const completedOrders: any[] = [];
  let fullyPaid = false;

  const payOrder = async (o: any) => {
    if (amountToDistribute <= 0) return;

    const [prevOPayments] = await tx
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(and(eq(schema.payments.order_id, o.id), eq(schema.payments.status, "completed")));

    const oPreviouslyPaid = Number(prevOPayments?.total_paid || 0);
    const orderRemaining = o.total - oPreviouslyPaid;
    if (orderRemaining <= 0) return;

    const payAmount = Math.min(amountToDistribute, orderRemaining);
    amountToDistribute -= payAmount;

    const [payment] = await tx
      .insert(schema.payments)
      .values({
        order_id: o.id,
        organization_id: args.organizationId,
        branch_id: args.branchId,
        method: "transfer",
        amount: payAmount,
        reference: args.reference,
        tip: 0,
        status: "completed",
      })
      .returning();
    paymentsCreated.push(payment);

    if (oPreviouslyPaid + payAmount >= o.total) {
      await tx
        .update(schema.orders)
        .set({ status: "completed", updated_at: new Date() })
        .where(eq(schema.orders.id, o.id));
      completedOrders.push(o);
    }
  };

  if (order.table_session_id) {
    // ⚠️ Chỉ loại `cancelled`, KHÔNG loại `completed` — phải khớp CHÍNH XÁC tập đơn
    // mà `dueBreakdown` đã dùng để tính số tiền in lên mã QR.
    //
    // Đơn có thể sang `completed` mà chưa hề có khoản thu nào (nhân viên bấm
    // "served → completed" tay). Bản cũ lọc bỏ `completed` ở đây nên phiếu QR đòi
    // cả phần đó, khách chuyển đủ, mà lúc rải tiền thì đơn đó vô hình → phần tiền
    // ấy KHÔNG thành dòng `payments` nào và bị vứt im lặng. Tiền nằm trong tài
    // khoản ngân hàng nhưng sổ quỹ ca hụt đúng số đó.
    const sessionOrders = await tx
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, order.table_session_id),
          sql`orders.status <> 'cancelled'`,
        ),
      )
      .orderBy(schema.orders.created_at);

    const sortedOrders = [order, ...sessionOrders.filter((o: any) => o.id !== order.id)];
    for (const o of sortedOrders) {
      await payOrder(o);
    }

    // Tiền về nhiều hơn tổng nợ của cả phiên. Không được im: đây là dấu hiệu phiếu
    // QR và sổ đã lệch nhau, phải có vết để đối soát chứ đừng nuốt như bản cũ.
    if (amountToDistribute > 0) {
      logger.error("Thu tiền dư so với tổng nợ của phiên — phần dư không ghi được", {
        orderId: order.id,
        tableSessionId: order.table_session_id,
        leftoverCents: amountToDistribute,
      });
    }

    const otherUncompletedOrders = await tx
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, order.table_session_id),
          sql`orders.status NOT IN ('completed', 'cancelled')`,
        ),
      );

    if (otherUncompletedOrders.length === 0) {
      fullyPaid = true;
      const [session] = await tx
        .select({ table_id: schema.tableSessions.table_id })
        .from(schema.tableSessions)
        .where(eq(schema.tableSessions.id, order.table_session_id))
        .limit(1);

      await tx
        .update(schema.tableSessions)
        .set({ status: "completed", ended_at: new Date() })
        .where(eq(schema.tableSessions.id, order.table_session_id));

      if (session) {
        await tx.update(schema.tables).set({ status: "available" }).where(eq(schema.tables.id, session.table_id));
      }

      return { order, paymentsCreated, completedOrders, fullyPaid, tableSessionId: order.table_session_id, tableId: session?.table_id };
    }
  } else {
    await payOrder(order);

    const [prevPayments] = await tx
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(and(eq(schema.payments.order_id, order.id), eq(schema.payments.status, "completed")));
    fullyPaid = Number(prevPayments?.total_paid || 0) >= order.total;
  }

  return { order, paymentsCreated, completedOrders, fullyPaid };
}

/** Chạy side-effect sau thanh toán (trừ kho + tích điểm) cho các đơn vừa completed. */
async function runCompletionSideEffects(orders: any[], organizationId: string, branchId: string) {
  for (const o of orders) {
    await handleOrderCompletion({
      orderId: o.id,
      orderNumber: o.order_number,
      orderTotal: o.total,
      customerId: o.customer_id,
      organizationId,
      branchId,
      inventoryDeducted: o.inventory_deducted,
    });
  }
}

/**
 * Số tiền đơn (hoặc cả phiên bàn) CÒN PHẢI TRẢ, tính bằng cents.
 *
 * Trả `null` khi đơn không còn hợp lệ để thu (không tìm thấy / đã huỷ).
 *
 * Dùng để chặn cảnh gói tin về muộn: khách gọi thêm món hoặc thu ngân đã thu tiền
 * mặt sau lúc dựng QR → số tiền trên QR không còn khớp, chốt tiếp là ghi sai sổ.
 */
type DueLine = { order: any; remaining: number };

/**
 * ⭐ NGUỒN SỰ THẬT DUY NHẤT cho câu hỏi "chỗ này còn nợ bao nhiêu, gồm những đơn nào".
 *
 * ⚠️ Vì sao phải gom về một chỗ — chuyện thật sáng 05/08/2026, bàn 13:
 * phiếu QR in ra liệt kê 85.000đ tiền món nhưng dòng TỔNG CẦN TRẢ ghi 70.000đ.
 * Khách chuyển đúng 70.000đ theo phiếu, rồi máy chủ TỪ CHỐI vì bàn nợ 85.000đ.
 * Bàn treo 31 phút, cuối cùng phải bấm tay.
 *
 * Gốc rễ là BA chỗ cùng trả lời một câu hỏi mà mỗi chỗ tính một kiểu:
 *   1. máy POS gửi lên số của nó (đọc từ bộ nhớ đệm, có thể đã cũ),
 *   2. lúc in, danh sách món gom theo kiểu "cho đơn vào rồi mới trừ tiền",
 *   3. lúc nhận tiền, đòi khớp đúng tổng nợ CẢ BÀN.
 *
 * Nay cả ba đều gọi vào đây. Muốn hỏi "còn nợ bao nhiêu" thì KHÔNG được tự tính
 * lại ở nơi khác — thêm một cách tính thứ hai là lỗi hôm đó quay lại nguyên xi.
 *
 * `lines` giữ đúng thứ tự tiền sẽ chảy vào: đơn đích trước, rồi các đơn còn lại
 * của phiên theo giờ tạo.
 *
 * Trả `null` khi đơn không còn hợp lệ để thu (không tìm thấy / đã huỷ).
 */
async function dueBreakdown(orderId: string): Promise<{ lines: DueLine[]; due: number } | null> {
  const [target] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!target || target.status === "cancelled") return null;

  let candidates: any[] = [target];
  if (target.table_session_id) {
    const sessionOrders = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, target.table_session_id),
          sql`orders.status != 'cancelled'`,
        ),
      )
      .orderBy(schema.orders.created_at);
    candidates = [target, ...sessionOrders.filter((o) => o.id !== target.id)];
  }

  const paidRows = await db
    .select({
      order_id: schema.payments.order_id,
      paid: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)::int`,
    })
    .from(schema.payments)
    .where(
      and(
        inArray(schema.payments.order_id, candidates.map((o) => o.id)),
        eq(schema.payments.status, "completed"),
      ),
    )
    .groupBy(schema.payments.order_id);
  const paidMap = new Map(paidRows.map((r) => [r.order_id, Number(r.paid || 0)]));

  const lines = candidates.map((order) => ({
    order,
    remaining: Math.max(0, order.total - (paidMap.get(order.id) || 0)),
  }));

  return { lines, due: lines.reduce((sum, l) => sum + l.remaining, 0) };
}

/**
 * Số tiền đơn (hoặc cả phiên bàn) CÒN PHẢI TRẢ, tính bằng cents.
 *
 * Dùng để chặn cảnh gói tin về muộn: khách gọi thêm món hoặc thu ngân đã thu tiền
 * mặt sau lúc dựng QR → số tiền trên QR không còn khớp, chốt tiếp là ghi sai sổ.
 */
async function currentDueForRequest(request: any): Promise<number | null> {
  const breakdown = await dueBreakdown(request.order_id);
  return breakdown ? breakdown.due : null;
}

/**
 * Gói dữ liệu đủ để Trạm quầy IN NGAY hóa đơn mà không phải gọi API vòng hai —
 * cùng cách `order:new` nhúng sẵn danh sách món.
 *
 * Nuốt lỗi và trả null: đây chỉ là phần trang trí cho gói tin. Tiền đã vào và đơn
 * đã chốt xong trước khi hàm này chạy — hỏng chỗ này không được phép làm hỏng đó.
 */
async function buildPaidOrderPayload(orderId: string) {
  try {
    const [order] = await db
      .select({
        order_number: schema.orders.order_number,
        customer_name: schema.orders.customer_name,
        subtotal: schema.orders.subtotal,
        tax: schema.orders.tax,
        total: schema.orders.total,
        table_session_id: schema.orders.table_session_id,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);
    if (!order) return null;

    const rawItems = await db
      .select({
        id: schema.orderItems.id,
        name: schema.orderItems.name,
        quantity: schema.orderItems.quantity,
        unit_price: schema.orderItems.unit_price,
        total: schema.orderItems.total,
        notes: schema.orderItems.notes,
        unit: schema.orderItems.unit,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    // Trạm quầy tự in hóa đơn từ gói tin này. Thiếu tùy chọn là phiếu in dòng món
    // theo giá gốc mà tổng lại là giá đã trừ tùy chọn — hai số vênh nhau.
    const modMap = await loadItemModifiers(rawItems.map((i) => i.id));
    const items = rawItems.map((i) => ({ ...i, modifiers: modMap.get(i.id) ?? [] }));

    let tableNumber: number | null = null;
    if (order.table_session_id) {
      const [row] = await db
        .select({ number: schema.tables.number })
        .from(schema.tableSessions)
        .innerJoin(schema.tables, eq(schema.tables.id, schema.tableSessions.table_id))
        .where(eq(schema.tableSessions.id, order.table_session_id))
        .limit(1);
      tableNumber = row?.number ?? null;
    }

    return {
      orderNumber: order.order_number,
      customerName: order.customer_name,
      tableNumber,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      items,
    };
  } catch {
    return null;
  }
}

/**
 * Món + tiền cho phiếu QR, gom đúng NHỮNG ĐƠN mà số tiền này sẽ trả.
 *
 * ⚠️ Không dùng thẳng `buildPaidOrderPayload` (chỉ một đơn). Bàn gọi thêm lượt hai
 * là thành hai đơn trong cùng phiên, và `completePaymentForOrder` rải tiền lần lượt
 * đơn đích trước rồi tới các đơn còn lại của phiên. Phiếu in ra phải liệt kê đúng
 * các đơn đó, nếu không khách cầm tờ giấy ghi 45.000đ mà QR đòi 82.000đ.
 *
 * Đi đúng thứ tự của `completePaymentForOrder` và dừng khi hết tiền — nhờ vậy
 * phiếu luôn khớp với chỗ tiền thực sự chảy vào.
 *
 * Nuốt lỗi, trả null: đây chỉ là phần trang trí cho gói tin, yêu cầu thanh toán đã
 * ghi vào DB xong rồi.
 */
async function buildTransferBillPayload(orderId: string, amount: number) {
  try {
    const breakdown = await dueBreakdown(orderId);
    if (!breakdown) return null;
    const target = breakdown.lines[0].order;

    /*
     * Chỉ liệt kê những đơn CÒN NỢ, và liệt kê ĐỦ.
     *
     * ⚠️ Bản cũ gom bằng vòng lặp "cho đơn vào rồi mới trừ tiền":
     *     if (budget <= 0) break; covered.push(o); budget -= o.total;
     * nên đơn cuối luôn bị lấy TRỌN dù tiền không đủ. Với 70.000đ và ba đơn
     * 45+15+25, nó liệt kê cả ba (85.000đ) trong khi dòng tổng ghi 70.000đ —
     * đúng tờ phiếu sai của bàn 13 sáng 05/08/2026.
     *
     * Nay `amount` luôn bằng `breakdown.due` (máy chủ tự tính, xem POST /requests)
     * nên danh sách này khớp khít với số tiền. Chốt chặn dưới đây canh điều đó.
     */
    const owing = breakdown.lines.filter((l) => l.remaining > 0);
    const covered = (owing.length > 0 ? owing : [breakdown.lines[0]]).map((l) => l.order);
    const coveredDue = owing.reduce((s, l) => s + l.remaining, 0);

    // Bất biến: phiếu KHÔNG được tự mâu thuẫn. Lệch là có ai đó lại thêm một cách
    // tính thứ hai — hét lên ngay thay vì lặng lẽ in ra tờ giấy sai.
    if (coveredDue !== amount) {
      logger.error("Phiếu QR lệch: món liệt kê không khớp số tiền phải trả", {
        orderId,
        amountTrenQR: amount,
        tongMonLietKe: coveredDue,
      });
    }

    const rawItems = await db
      .select({
        id: schema.orderItems.id,
        name: schema.orderItems.name,
        quantity: schema.orderItems.quantity,
        unit_price: schema.orderItems.unit_price,
        total: schema.orderItems.total,
        notes: schema.orderItems.notes,
        unit: schema.orderItems.unit,
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.order_id, covered.map((o) => o.id)));

    // Tên/giá tùy chọn đọc từ SNAPSHOT trong order_item_modifiers, không join bảng
    // modifiers sống — sửa giá topping hôm nay không được đổi phiếu của đơn cũ.
    const modMap = await loadItemModifiers(rawItems.map((i) => i.id));
    const items = rawItems.map((i) => ({ ...i, modifiers: modMap.get(i.id) ?? [] }));

    let tableNumber: number | null = null;
    if (target.table_session_id) {
      const [row] = await db
        .select({ number: schema.tables.number })
        .from(schema.tableSessions)
        .innerJoin(schema.tables, eq(schema.tables.id, schema.tableSessions.table_id))
        .where(eq(schema.tableSessions.id, target.table_session_id))
        .limit(1);
      tableNumber = row?.number ?? null;
    }

    /*
     * Ba dòng tiền cuối phiếu phải CỘNG ĐÚNG với nhau: Tạm tính + Thuế = TỔNG CẦN TRẢ.
     *
     * Nên `subtotal` suy NGƯỢC ra từ `amount` chứ không cộng độc lập từ các đơn.
     * Cộng độc lập là mở lại đúng cái cửa đã làm hỏng phiếu bàn 13: hai con số
     * cùng nằm trên một tờ giấy mà tính bằng hai đường khác nhau thì sớm muộn
     * cũng lệch, và người cầm tờ giấy không có cách nào biết bên nào đúng.
     *
     * Thuế chỉ lấy của những đơn còn nợ TRỌN VẸN — đơn trả dở thì phần thuế đã
     * đi kèm phần tiền đã trả rồi.
     */
    const coveredTax = owing.reduce(
      (s, l) => s + (l.remaining === l.order.total ? l.order.tax : 0),
      0,
    );

    return {
      orderNumber: target.order_number,
      customerName: target.customer_name,
      tableNumber,
      subtotal: amount - coveredTax,
      tax: coveredTax,
      // Tổng = ĐÚNG số tiền trên mã QR. Đây là con số khách phải chuyển, và cũng
      // là con số máy chủ sẽ đòi khớp lúc tiền về.
      total: amount,
      items,
    };
  } catch {
    return null;
  }
}

/**
 * Nhờ Trạm quầy in phiếu QR chuyển khoản.
 *
 * ⚠️ Đây là đường DUY NHẤT mã QR đi tới khách. Máy bấm đơn (điện thoại nhân viên)
 * không còn hiện QR lên màn hình nữa: chủ quán yêu cầu mọi mã phải do trạm in
 * sinh ra rồi bưng phiếu ra bàn. Đừng thêm đường nào trả `qr_payload` về cho
 * giao diện rồi vẽ tại chỗ.
 *
 * Nuốt lỗi: yêu cầu thanh toán đã ghi xong vào DB trước khi hàm này chạy. In hỏng
 * thì thu ngân bấm "In lại phiếu", chứ không được làm hỏng cả lượt tạo yêu cầu.
 */
async function broadcastTransferPrint(args: {
  branchId: string;
  orderId: string;
  request: any;
  provider: string;
  bank: WsPrintTransferPayload["bank"];
}) {
  try {
    const info = await buildTransferBillPayload(args.orderId, args.request.amount);
    if (!info) return;

    const payload: WsPrintTransferPayload = {
      paymentRequestId: args.request.id,
      orderId: args.orderId,
      orderNumber: info.orderNumber,
      tableNumber: info.tableNumber,
      customerName: info.customerName,
      expiresAt:
        args.request.expires_at instanceof Date
          ? args.request.expires_at.toISOString()
          : (args.request.expires_at ?? null),
      paymentCode: args.request.payment_code,
      provider: args.provider,
      // Thiếu cấu hình ngân hàng → null, phiếu in ra không có QR. KHÔNG rơi về
      // payment_code: quét ra "TODA-…" là app ngân hàng báo mã không hợp lệ.
      qrPayload: args.request.qr_payload ?? null,
      qrUrl: args.request.qr_url ?? null,
      subtotal: info.subtotal,
      tax: info.tax,
      total: info.total,
      items: info.items as WsPrintTransferPayload["items"],
      bank: args.bank ?? null,
    };

    await wsManager.publish(`branch:${args.branchId}`, {
      type: "print:transfer",
      payload,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    logger.error("Không gửi được lệnh in phiếu QR ra trạm quầy", {
      orderId: args.orderId,
      branchId: args.branchId,
      err: err?.message,
    });
  }
}

/**
 * Chốt đơn khi tiền đã thực sự vào: ghi payment, đóng đơn, đóng phiên bàn, nhả
 * bàn, trừ kho, tích điểm, rồi báo mọi máy.
 *
 * Dùng chung cho CẢ BA đường tiền vào (SePay webhook / MoMo IPN / đối soát định
 * kỳ). Đừng chép lại logic này ở đường thứ tư — ba đường lệch nhau là nguồn gốc
 * của cảnh "đơn chốt nhưng bàn không dọn".
 *
 * Trả `null` khi phiếu đã được người khác chốt mất — người gọi PHẢI coi đó là
 * "đã chốt rồi", không ghi thêm gì và không báo gì.
 */
async function finalizePaidRequest(request: any, args: {
  provider: string;
  providerTransactionId: string;
  paidAmountCents: number;
  providerPayload: unknown;
  reference: string;
}) {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    /*
     * ⚠️ GIÀNH QUYỀN CHỐT TRƯỚC, rồi mới ghi tiền. Thứ tự này là bắt buộc.
     *
     * Bản cũ ghi payment trước rồi mới đổi trạng thái, và chỗ kiểm "phiếu đã
     * paid chưa" nằm ở `settleMatchedRequest` — đọc trên một BẢN CHỤP lấy từ
     * trước, không khoá dòng. Android hay đẩy lại y hệt một thông báo ngân hàng;
     * hai lượt tới cách nhau vài phần nghìn giây thì CẢ HAI cùng đọc thấy
     * `pending`, cả hai đi tiếp, cả hai ghi một khoản thu đủ.
     *
     * Đo trên dữ liệu thật 31/07–24/08: 58 đơn bị ghi thu hai lần, 1.673.000đ
     * tiền chuyển khoản ảo trong sổ (tiền thật trong tài khoản chỉ có một lần).
     * Hai dòng cách nhau ít nhất 0,000015 giây — không cách nào chặn bằng kiểm
     * tra thông thường.
     *
     * `UPDATE ... WHERE status='pending'` khoá dòng phiếu: lượt thứ hai chờ ở
     * đây, khoá nhả ra thì Postgres kiểm lại điều kiện, thấy đã `paid` → khớp 0
     * dòng → thoát tay không. Không cần bảng phụ, không cần khoá ứng dụng.
     */
    const [claimed] = await tx
      .update(schema.paymentRequests)
      .set({
        status: "paid",
        paid_amount: args.paidAmountCents,
        provider_transaction_id: args.providerTransactionId || null,
        provider_payload: args.providerPayload as any,
        paid_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(schema.paymentRequests.id, request.id),
          eq(schema.paymentRequests.status, "pending"),
        ),
      )
      .returning({ id: schema.paymentRequests.id });

    if (!claimed) return null;

    return await completePaymentForOrder(tx, {
      orderId: request.order_id,
      organizationId: request.organization_id,
      branchId: request.branch_id,
      amount: request.amount,
      reference: args.reference,
    });
  });

  // Lượt này thua cuộc đua — phiếu đã được chốt xong xuôi ở lượt kia. Im lặng
  // rút lui: gọi tiếp là trừ kho lần hai và trạm quầy in hóa đơn lần hai.
  if (!result) return null;

  // Sau khi tx commit: trừ kho + tích điểm (idempotent, tự nuốt lỗi).
  await runCompletionSideEffects(result.completedOrders || [], request.organization_id, request.branch_id);

  const orderPayload = await buildPaidOrderPayload(request.order_id);

  await wsManager.publish(`branch:${request.branch_id}`, {
    type: "payment:confirmed",
    payload: {
      paymentRequestId: request.id,
      orderId: request.order_id,
      provider: args.provider,
      amount: args.paidAmountCents,
      expectedAmount: request.amount,
      fullyPaid: result.fullyPaid,
      ...(orderPayload || {}),
    },
    timestamp: Date.now(),
  });

  if (result.tableSessionId && result.tableId) {
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "session:ended",
      payload: { sessionId: result.tableSessionId, tableId: result.tableId },
      timestamp: Date.now(),
    });
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "table:status",
      payload: { tableId: result.tableId, status: "available" },
      timestamp: Date.now(),
    });
  }

  return result;
}

/**
 * Tìm phiếu theo mã in trên hoá đơn (TODA-…).
 *
 * Ưu tiên phiếu CÒN CHỜ và mới nhất. Mã có 6 ký tự ngẫu nhiên nên trùng là
 * chuyện hiếm, nhưng `.limit(1)` không kèm sắp xếp thì đúng lúc trùng sẽ vớ đại
 * một phiếu cũ đã đóng — tiền khách vào mà đơn đang mở thì không bao giờ chốt.
 */
async function findPaymentRequestByCodes(candidates: string[]) {
  const codes = Array.from(new Set(candidates.map((c) => c.trim().toUpperCase()).filter(Boolean)));
  if (codes.length === 0) return undefined;
  const flattened = Array.from(new Set(codes.map(stripCodeSeparators).filter(Boolean)));

  // So bằng đúng: mã nguyên văn, hoặc mã đã bỏ gạch nối.
  //
  // Kênh DIRECT_DEBITS và một số QR liên ngân hàng XOÁ SẠCH gạch nối trong nội
  // dung. Không so thêm bản đã làm phẳng thì những giao dịch đó không bao giờ
  // khớp — khách trả tiền mà bàn treo mãi.
  const exactMatch = or(
    inArray(schema.paymentRequests.payment_code, codes),
    inArray(sql`REPLACE(${schema.paymentRequests.payment_code}, '-', '')`, flattened),
  )!;

  /**
   * Khớp phần ĐẦU: mã đã lưu là khúc mở đầu của chuỗi bóc được.
   *
   * Kênh ACB dán thêm ngày vào cuối nội dung — `TODA-44-L2YMNY-010826` trong khi
   * phiếu lưu `TODA-44-L2YMNY`. So bằng đúng là trượt, và ngày 01/08 đã mất 2 lượt
   * vì chuyện này.
   *
   * Đòi mã lưu dài từ MIN_PREFIX_CODE_LEN ký tự để không có mã cụt nào vô tình
   * thành đầu của mã dài hơn: dạng thật là TODA + số phiếu + 6 ký tự ngẫu nhiên,
   * ngắn nhất cũng 11 ký tự sau khi bỏ gạch nối.
   */
  const prefixMatch = flattened.map(
    (flat) => sql`(
      ${flat} LIKE REPLACE(${schema.paymentRequests.payment_code}, '-', '') || '%'
      AND length(REPLACE(${schema.paymentRequests.payment_code}, '-', '')) >= ${MIN_PREFIX_CODE_LEN}
    )`,
  );

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(or(exactMatch, ...prefixMatch))
    .orderBy(
      // Bằng đúng luôn thắng khớp đầu — khớp đầu chỉ là đường cứu vớt.
      sql`CASE WHEN ${exactMatch} THEN 0 ELSE 1 END`,
      // Ưu tiên phiếu CÒN CHỜ: tiền khách vào mà đơn đang mở thì phải chốt đơn đó,
      // không phải một phiếu cũ đã đóng.
      sql`CASE WHEN payment_requests.status = 'pending' THEN 0 ELSE 1 END`,
      // Trong nhóm khớp đầu, mã DÀI hơn thắng: nó ăn khớp nhiều ký tự hơn nên
      // chắc chắn hơn.
      sql`length(payment_requests.payment_code) DESC`,
      desc(schema.paymentRequests.created_at),
    )
    .limit(1);
  return request;
}

/**
 * Chặng chung sau khi đã tìm ra phiếu và đã xác thực xong nguồn tiền: kiểm
 * trạng thái → kiểm tổng đơn có đổi không → kiểm thiếu tiền → chốt.
 *
 * Tách ra vì đúng lời cảnh báo ngay trên `finalizePaidRequest`: mỗi nguồn tiền
 * tự chép lại chuỗi kiểm tra này là các đường lệch nhau. Nguồn mới chỉ phải lo
 * phần XÁC THỰC của riêng nó rồi gọi vào đây.
 */
async function settleMatchedRequest(request: any, args: {
  provider: string;
  providerTransactionId: string;
  amountCents: number;
  content: string;
  payload: unknown;
}) {
  const base = {
    provider: args.provider,
    providerTransactionId: args.providerTransactionId,
    paymentRequestId: request.id,
    branchId: request.branch_id,
    amount: args.amountCents,
    content: args.content,
    payload: args.payload,
  };

  if (request.status === "paid") {
    await logWebhookEvent({ ...base, matched: true, reason: "already_paid" });
    return { matched: true, reason: "already_paid" };
  }

  const now = new Date();
  if (request.status !== "pending" || now > request.expires_at) {
    if (request.status === "pending") {
      await db
        .update(schema.paymentRequests)
        .set({ status: "expired", updated_at: now })
        .where(eq(schema.paymentRequests.id, request.id));
    }
    await logWebhookEvent({ ...base, matched: false, reason: "expired_or_cancelled" });
    return { matched: false, reason: "expired_or_cancelled" };
  }

  const currentDue = await currentDueForRequest(request);

  if (currentDue === null || currentDue !== request.amount) {
    await db
      .update(schema.paymentRequests)
      .set({ status: "cancelled", cancelled_at: now, updated_at: now })
      .where(eq(schema.paymentRequests.id, request.id));
    await logWebhookEvent({ ...base, matched: false, reason: "stale_order_amount" });

    /*
     * ⚠️ TIỀN ĐÃ VÀO TÀI KHOẢN nhưng không khớp — PHẢI báo, không được im.
     *
     * Bản cũ chỉ ghi log rồi thôi. Sáng 05/08/2026 bàn 13: khách chuyển 70.000đ
     * lúc 08:43:25, máy chủ biết thừa là tiền đã về và biết cả lý do lệch, mà
     * không nói với ai. Thu ngân ngồi nhìn "Đang chờ chuyển khoản" thêm 31 phút.
     */
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "payment:mismatch",
      payload: {
        paymentRequestId: request.id,
        orderId: request.order_id,
        receivedAmount: args.amountCents,
        expectedAmount: request.amount,
        currentDue,
      },
      timestamp: Date.now(),
    });

    return { matched: false, reason: "stale_order_amount" };
  }

  /*
   * ⚠️ So theo ĐỒNG, không so theo xu.
   *
   * Mã QR chỉ chở được số nguyên đồng (`centsToVnd` làm tròn), nên đơn có xu lẻ —
   * sinh ra từ giảm giá phần trăm hoặc tách bàn — thì khách chuyển ĐÚNG số in trên
   * phiếu vẫn thiếu vài xu so với `request.amount`. So theo xu là đơn đó không bao
   * giờ chốt được, dù khách không hề làm sai.
   */
  if (centsToVnd(args.amountCents) < centsToVnd(request.amount)) {
    await db
      .update(schema.paymentRequests)
      .set({
        paid_amount: args.amountCents,
        provider_transaction_id: args.providerTransactionId || null,
        provider_payload: args.payload as any,
        updated_at: now,
      })
      .where(eq(schema.paymentRequests.id, request.id));
    await logWebhookEvent({ ...base, matched: false, reason: "underpaid" });
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "payment:underpaid",
      payload: {
        paymentRequestId: request.id,
        orderId: request.order_id,
        amount: args.amountCents,
        expectedAmount: request.amount,
      },
      timestamp: Date.now(),
    });
    return { matched: false, reason: "underpaid" };
  }

  const settled = await finalizePaidRequest(request, {
    provider: args.provider,
    providerTransactionId: args.providerTransactionId,
    paidAmountCents: args.amountCents,
    providerPayload: args.payload,
    // Ghi mã ĐÃ LƯU chứ không phải mã bóc từ thông báo: kênh chuyển tiền có thể
    // đã xoá gạch nối, sổ sách phải mang mã gốc để đối chiếu với phiếu đã in.
    reference: request.payment_code,
  });

  // Thua cuộc đua: một lượt khác vừa chốt đúng phiếu này. Vẫn là "khớp" — tiền
  // đã vào sổ rồi — chỉ là lượt này không được ghi thêm gì.
  if (!settled) {
    await logWebhookEvent({ ...base, matched: true, reason: "already_paid" });
    return { matched: true, reason: "already_paid" };
  }

  const reason = args.amountCents > request.amount ? "overpaid" : "paid";
  await logWebhookEvent({ ...base, matched: true, reason });
  return { matched: true, reason };
}

// Public SePay webhook. This must stay before auth middleware.
payments.post("/webhooks/sepay", async (c) => {
  // Giữ NGUYÊN chuỗi body thô để verify HMAC — SePay ký trên đúng byte đã gửi,
  // JSON.stringify lại sẽ đổi thứ tự/khoảng trắng và chữ ký không bao giờ khớp.
  const rawBody = await c.req.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }
  const providerTransactionId = webhookTransactionId(body);
  const amount = webhookAmountCents(body);
  const content = webhookContent(body);
  // SePay tự bóc mã đơn ra trường `code` theo cấu hình tiền tố bên nó. Ưu tiên
  // dùng nếu có, rồi mới tới các mã "TODA…" tìm được trong nội dung.
  const codeCandidates = [normalizeText(body.code).toUpperCase(), ...extractPaymentCodes(content)].filter(Boolean);
  const paymentCode = codeCandidates[0] || "";
  const transferType = normalizeText(body.transferType || body.transfer_type).toLowerCase();

  if (transferType && transferType !== "in") {
    await logWebhookEvent({ provider: "sepay", providerTransactionId, amount, content, matched: false, reason: "ignored_transfer_type", payload: body });
    return c.json({ success: true });
  }

  if (!paymentCode) {
    await logWebhookEvent({ provider: "sepay", providerTransactionId, amount, content, matched: false, reason: "missing_payment_code", payload: body });
    return c.json({ success: true });
  }

  const request = await findPaymentRequestByCodes(codeCandidates);

  if (!request) {
    await logWebhookEvent({ provider: "sepay", providerTransactionId, amount, content, matched: false, reason: "payment_request_not_found", payload: body });
    return c.json({ success: true });
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, request.branch_id))
    .limit(1);
  const sepay = paymentSettings(branch);
  const expectedSecret = normalizeText(sepay.webhook_secret || sepay.webhookSecret || sepay.api_key || sepay.apiKey);

  /**
   * SePay cho chọn 4 kiểu xác thực; mình chấp nhận hai kiểu dùng được:
   *
   * - **API Key** → `Authorization: Apikey <khóa>`
   *   ⚠️ Tiền tố là **"Apikey"**, KHÔNG phải "Bearer". Trước đây chỉ bóc "Bearer "
   *   nên giá trị đem so là "Apikey abc..." → lệch → trả 401 cho MỌI giao dịch.
   *   Khách chuyển tiền mà đơn treo mãi, và không có lỗi nào nổi lên.
   * - **HMAC-SHA256** → `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp`,
   *   ký trên chuỗi `{timestamp}.{body thô}`. Chắc hơn API Key vì chống sửa
   *   nội dung giữa đường, nên thử trước.
   */
  const sigHeader = normalizeText(c.req.header("x-sepay-signature"));
  const sigTimestamp = normalizeText(c.req.header("x-sepay-timestamp"));
  let secretMatches = false;

  if (expectedSecret && sigHeader && sigTimestamp) {
    const expectedSig = createHmac("sha256", expectedSecret)
      .update(`${sigTimestamp}.${rawBody}`)
      .digest("hex");
    const provided = sigHeader.replace(/^sha256=/i, "");
    secretMatches =
      provided.length === expectedSig.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSig));
  } else if (expectedSecret) {
    const providedSecret = normalizeText(
      c.req.header("x-sepay-api-key") ||
      c.req.header("x-api-key") ||
      c.req.header("authorization")?.replace(/^(Apikey|Bearer)\s+/i, ""),
    );
    secretMatches = providedSecret === expectedSecret;
  }

  // Bắt buộc phải cấu hình secret. Nếu chưa cấu hình, từ chối để tránh webhook
  // giả mạo báo "đã thanh toán" khi chi nhánh chưa đặt secret.
  if (!expectedSecret) {
    await logWebhookEvent({
      provider: "sepay",
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: false,
      reason: "webhook_secret_not_configured",
      payload: body,
    });
    return c.json({ success: false, error: "webhook secret not configured" }, 401);
  }

  if (!secretMatches) {
    await logWebhookEvent({
      provider: "sepay",
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: false,
      reason: "invalid_webhook_secret",
      payload: body,
    });
    return c.json({ success: false, error: "invalid secret" }, 401);
  }

  await settleMatchedRequest(request, {
    provider: "sepay",
    providerTransactionId,
    amountCents: amount,
    content,
    payload: body,
  });

  return c.json({ success: true });
});

/** Bỏ dấu tiếng Việt để bắt từ khoá không phụ thuộc máy gõ có dấu hay không. */
function stripDiacritics(value: string) {
  // Lọc theo MÃ ký tự thay vì regex: dải dấu tổ hợp U+0300..U+036F là các ký tự
  // vô hình, dán thẳng vào regex thì nhìn như ô trống và vỡ khi đổi mã hoá file.
  const withoutMarks = value
    .normalize("NFD")
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  // "đ" không phải chữ có dấu tổ hợp nên NFD không tách ra, phải thay riêng.
  return withoutMarks.replace(/\u0111/g, "d").replace(/\u0110/g, "D");
}

/**
 * Bóc số tiền và HƯỚNG tiền từ thông báo đẩy của app ngân hàng.
 *
 * Trả `direction: "unknown"` khi không chắc, và nơi gọi phải từ chối — tuyệt
 * đối đừng đoán bừa là tiền vào. Thông báo TRỪ tiền cũng mang đủ số tài khoản
 * lẫn nội dung chuyển khoản; đọc nhầm hướng là lúc quán chuyển tiền đi thì POS
 * tự chốt đơn của khách.
 */
function parseBankNotificationAmount(text: string): {
  amountVnd: number;
  direction: "in" | "out" | "unknown";
} {
  const flat = stripDiacritics(text).toLowerCase();
  // ⚠️ Dùng CHUNG `parseVndAmount` với webhook. Bản cũ ở đây xóa cả dấu thập phân
  // nên "+5,000.00 VND" đọc thành 500.000đ — gấp 100 lần, và vì khâu chốt chỉ so
  // "nhận >= phải trả" nên khách chuyển 5.000đ vẫn đóng được hóa đơn 50.000đ.
  const toVnd = (raw: string) => parseVndAmount(raw);

  // Dạng có dấu, hay gặp nhất: "+18,000 VND" / "-50.000đ"
  const signed = flat.match(/([+\-])\s*(\d[\d.,\s]*?)\s*(?:vnd|d)\b/);
  if (signed) {
    return { amountVnd: toVnd(signed[2]), direction: signed[1] === "-" ? "out" : "in" };
  }

  // Dạng viết chữ: "tăng 18,000 VND", "ghi có 18.000đ", "giảm 50.000 VND"
  const worded = flat.match(/(tang|ghi co|nhan|giam|ghi no|tru)\s*[:\s]*(\d[\d.,\s]*?)\s*(?:vnd|d)\b/);
  if (worded) {
    const debit = ["giam", "ghi no", "tru"].includes(worded[1]);
    return { amountVnd: toVnd(worded[2]), direction: debit ? "out" : "in" };
  }

  return { amountVnd: 0, direction: "unknown" };
}

/**
 * Cầu thông báo ngân hàng — app "TODA Bank Bridge" trên điện thoại chủ quán đọc
 * thông báo đẩy của app VCB rồi chuyển NGUYÊN VĂN vào đây.
 *
 * Vì sao gửi nguyên văn chứ không bóc sẵn dưới điện thoại: ngân hàng đổi câu chữ
 * thì chỉ phải sửa regex rồi deploy, khỏi build lại APK và cài tay lên máy chủ
 * quán. Điện thoại chỉ lo mỗi việc chuyển tiếp và thử lại khi mất mạng.
 *
 * Phải nằm TRƯỚC authMiddleware: điện thoại không có token đăng nhập, nó tự xác
 * thực bằng khóa riêng của chi nhánh.
 */
/**
 * Xác thực một lời gọi đến từ điện thoại cầu nối.
 *
 * Dùng chung cho cả `bank-push` (báo tiền vào) lẫn `bridge-ping` (báo còn sống).
 * Chép lại chuỗi kiểm tra này cho endpoint thứ hai là hai đường lệch nhau, mà
 * đường lệch ở khâu XÁC THỰC thì hỏng theo kiểu im lặng và nguy hiểm.
 *
 * Trả về `{ ok: false, response }` để chỗ gọi `return` thẳng, hoặc
 * `{ ok: true, branch, cfg }` khi qua cửa.
 */
async function authenticateBridgeCall(c: any, body: any) {
  const branchId = normalizeText(c.req.header("x-toda-branch") || body.branchId);
  const providedKey = normalizeText(c.req.header("x-toda-bridge-key"));

  if (!branchId) {
    return { ok: false as const, branchId: "", response: c.json({ success: false, error: "missing branch" }, 401) };
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const cfg = ((branch?.settings || {}) as Record<string, any>).payment?.bank_push || {};
  const expectedKey = normalizeText(cfg.secret);

  // Chưa bật hoặc chưa đặt khóa thì từ chối thẳng — cùng lối với SePay. Thiếu
  // bước này thì ai đoán ra branchId là bấm được nút "đã thanh toán" cho cả quán.
  if (!branch || !cfg.enabled || !expectedKey) {
    return { ok: false as const, branchId, response: c.json({ success: false, error: "bank push not configured" }, 401) };
  }

  const keyMatches =
    providedKey.length === expectedKey.length &&
    timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey));
  if (!keyMatches) {
    return { ok: false as const, branchId, response: c.json({ success: false, error: "invalid key" }, 401) };
  }

  return { ok: true as const, branchId, branch, cfg };
}

/**
 * Nhịp thở: điện thoại cầu nối gọi về mỗi vài phút để nói "tôi còn sống".
 *
 * Vì sao cần: cầu nối chỉ lên tiếng khi có tiền vào, nên im vì chết và im vì
 * vắng khách nhìn y hệt nhau. Ngày 04/08/2026 nó im 9 tiếng, hai lượt chuyển
 * khoản phải bấm tay mà không ai biết là hỏng.
 */
payments.post("/webhooks/bridge-ping", async (c) => {
  const rawBody = await c.req.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }

  const auth = await authenticateBridgeCall(c, body);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const queueSize = Number.isFinite(Number(body.queueSize)) ? Math.max(0, Math.round(Number(body.queueSize))) : 0;
  // Chỉ coi là mù khi điện thoại BÁO RÕ là false. Bản APK cũ chưa biết gửi
  // trường này — thiếu mà mặc định false thì POS báo đỏ oan suốt.
  const listenerOk = body.listenerOk !== false;

  await db
    .insert(schema.bridgeHeartbeats)
    .values({
      branch_id: auth.branchId,
      last_seen_at: now,
      app_version: normalizeText(body.appVersion).slice(0, 30) || null,
      queue_size: queueSize,
      listener_ok: listenerOk,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.bridgeHeartbeats.branch_id,
      set: {
        last_seen_at: now,
        app_version: normalizeText(body.appVersion).slice(0, 30) || null,
        queue_size: queueSize,
        listener_ok: listenerOk,
        updated_at: now,
      },
    });

  return c.json({ success: true });
});

payments.post("/webhooks/bank-push", async (c) => {
  const rawBody = await c.req.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }

  const auth = await authenticateBridgeCall(c, body);
  if (!auth.ok) return auth.response;
  const { branchId, cfg } = auth;

  // Gộp mọi mảnh chữ của thông báo: phần đầy đủ hay nằm ở bigText/textLines chứ
  // không phải dòng ngắn hiện ngoài màn khoá.
  const parts = [
    body.title,
    body.text,
    body.bigText,
    ...(Array.isArray(body.textLines) ? body.textLines : []),
  ];
  const content = parts.map((p) => normalizeText(p)).filter(Boolean).join(" | ");

  if (!content) return c.json({ success: true, matched: false, reason: "empty_notification" });

  // Băm nguyên văn để chống trùng: Android hay đẩy lại/cập nhật cùng một thông
  // báo, và app cũng gửi lại khi mất mạng — băm ra y hệt nên unique
  // (provider, provider_transaction_id) tự chặn.
  const providerTransactionId = createHash("sha256").update(content).digest("hex").slice(0, 32);
  const { amountVnd, direction } = parseBankNotificationAmount(content);
  const amount = amountVnd * 100; // thông báo ghi VNĐ, DB lưu XU
  const codeCandidates = extractPaymentCodes(content);

  const logBase = {
    provider: "bank_push",
    providerTransactionId,
    branchId,
    amount,
    content,
    payload: body,
  };

  /**
   * Hàng rào thứ hai: chỉ app ngân hàng đã khai mới được chốt đơn.
   *
   * Điện thoại đã lọc một lần rồi, nhưng ai cầm được khóa vẫn gọi thẳng vào đây
   * được — mà đã lọc ở nơi mình không kiểm soát thì coi như chưa lọc. Trả 200 để
   * nút "Gửi thử" của app (dùng tên gói riêng của nó) vẫn xác nhận được đường
   * truyền và khóa là đúng.
   */
  const allowedPackages: string[] = Array.isArray(cfg.package_names) ? cfg.package_names : [];
  const notifPackage = normalizeText(body.packageName);
  if (allowedPackages.length > 0 && !allowedPackages.some((p) => normalizeText(p).toLowerCase() === notifPackage.toLowerCase())) {
    await logWebhookEvent({
      provider: "bank_push",
      providerTransactionId,
      branchId,
      amount,
      content,
      matched: false,
      reason: "package_not_allowed",
      payload: body,
    });
    return c.json({ success: true, matched: false, reason: "package_not_allowed" });
  }

  // Không chắc là tiền vào thì bỏ qua, nhưng VẪN ghi log — đó chính là dữ liệu
  // để biết VCB đang viết thông báo theo mẫu nào mà chỉnh lại regex.
  if (direction !== "in" || amount <= 0) {
    await logWebhookEvent({
      ...logBase,
      matched: false,
      reason: direction === "out" ? "ignored_debit" : "unparsed_amount",
    });
    return c.json({ success: true, matched: false, reason: "not_credit" });
  }

  if (codeCandidates.length === 0) {
    await logWebhookEvent({ ...logBase, matched: false, reason: "missing_payment_code" });
    return c.json({ success: true, matched: false, reason: "missing_payment_code" });
  }

  const request = await findPaymentRequestByCodes(codeCandidates);
  if (!request) {
    await logWebhookEvent({ ...logBase, matched: false, reason: "payment_request_not_found" });
    return c.json({ success: true, matched: false, reason: "payment_request_not_found" });
  }

  // Khóa của một chi nhánh chỉ được chốt đơn của chính chi nhánh đó.
  if (request.branch_id !== branchId) {
    await logWebhookEvent({
      ...logBase,
      paymentRequestId: request.id,
      matched: false,
      reason: "branch_mismatch",
    });
    return c.json({ success: true, matched: false, reason: "branch_mismatch" });
  }

  const result = await settleMatchedRequest(request, {
    provider: "bank_push",
    providerTransactionId,
    amountCents: amount,
    content,
    payload: body,
  });

  // Luôn trả 200: báo lỗi thì điện thoại cứ thử lại vô ích mãi cho một thông báo
  // không bao giờ khớp được.
  return c.json({ success: true, ...result });
});

/**
 * IPN của MoMo — MoMo gọi vào đây khi khách trả xong. Phải nằm TRƯỚC
 * authMiddleware (MoMo không có token của mình).
 *
 * ⚠️ Khác webhook SePay ở hai chỗ dễ sai:
 *  1. Trả **HTTP 204 rỗng**, không phải JSON 200. Trả sai kiểu là MoMo coi như
 *     thất bại và gửi lại nhiều lần.
 *  2. Hạn trả lời **15 giây** — nên mọi việc nặng phải xong trước đó, đừng thêm
 *     lệnh gọi mạng nào vào đường này.
 */
payments.post("/webhooks/momo", async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const orderId = normalizeText(body.orderId);
  const providerTransactionId = normalizeText(body.transId);
  // MoMo gửi VND nguyên; toàn bộ hệ thống tính bằng cents.
  const amountCents = Math.round(Number(body.amount || 0) * 100);
  const content = normalizeText(body.orderInfo);
  const resultCode = Number(body.resultCode);

  const log = (matched: boolean, reason: string, branchId?: string | null, requestId?: string | null) =>
    logWebhookEvent({
      provider: "momo",
      providerTransactionId,
      paymentRequestId: requestId || null,
      branchId: branchId || null,
      amount: amountCents,
      content,
      matched,
      reason,
      payload: body,
    });

  if (!orderId) {
    await log(false, "missing_order_id");
    return c.body(null, 204);
  }

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(
      and(
        eq(schema.paymentRequests.payment_code, orderId),
        eq(schema.paymentRequests.provider, "momo"),
      ),
    )
    .limit(1);

  if (!request) {
    await log(false, "payment_request_not_found");
    return c.body(null, 204);
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, request.branch_id))
    .limit(1);
  const momo = momoSettings(branch);

  // Chưa cấu hình khóa → từ chối. Cùng nguyên tắc với bản vá SePay: không có
  // khóa nghĩa là ai cũng bắn được gói tin "đã thanh toán" giả.
  if (!hasMomoCredentials(momo)) {
    await log(false, "momo_credentials_not_configured", request.branch_id, request.id);
    return c.json({ success: false, error: "momo credentials not configured" }, 401);
  }

  if (!verifyMomoIpnSignature(body, momo)) {
    await log(false, "invalid_signature", request.branch_id, request.id);
    return c.json({ success: false, error: "invalid signature" }, 401);
  }

  // MoMo yêu cầu đối chiếu tường minh partnerCode/orderId/amount với dữ liệu của mình.
  if (normalizeText(body.partnerCode) !== momo.partnerCode) {
    await log(false, "partner_code_mismatch", request.branch_id, request.id);
    return c.json({ success: false, error: "partner code mismatch" }, 401);
  }

  if (resultCode !== 0) {
    // Khách huỷ giữa chừng / thẻ bị từ chối: ghi lại rồi thôi, KHÔNG chốt đơn.
    await log(false, `momo_result_${resultCode}`, request.branch_id, request.id);
    return c.body(null, 204);
  }

  if (request.status === "paid") {
    await log(true, "already_paid", request.branch_id, request.id);
    return c.body(null, 204);
  }

  const now = new Date();
  if (request.status !== "pending" || now > request.expires_at) {
    if (request.status === "pending") {
      await db
        .update(schema.paymentRequests)
        .set({ status: "expired", updated_at: now })
        .where(eq(schema.paymentRequests.id, request.id));
    }
    await log(false, "expired_or_cancelled", request.branch_id, request.id);
    return c.body(null, 204);
  }

  /*
   * ⚠️ So theo ĐỒNG chứ không theo xu — cùng lý do với đường chuyển khoản ngân hàng:
   * số gửi sang MoMo là `centsToVnd(amount)` đã làm tròn, nên đơn có xu lẻ (giảm giá
   * phần trăm, tách bàn) thì IPN trả về không bao giờ bằng `request.amount` tính
   * theo xu → giao dịch nào cũng "lệch số tiền" dù khách đã bị trừ tiền trong ví.
   */
  const momoMismatch = centsToVnd(amountCents) !== centsToVnd(request.amount);

  // Đơn có thể đã được thu tiền mặt / gọi thêm món sau khi dựng QR. Chốt tiếp là
  // ghi thừa một khoản thu không có thật vào sổ.
  const due = momoMismatch ? null : await currentDueForRequest(request);
  const staleAmount = !momoMismatch && (due === null || due !== request.amount);

  if (momoMismatch || staleAmount) {
    if (staleAmount) {
      await db
        .update(schema.paymentRequests)
        .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
        .where(eq(schema.paymentRequests.id, request.id));
    }
    await log(false, momoMismatch ? "amount_mismatch" : "stale_order_amount", request.branch_id, request.id);

    /*
     * ⚠️ TIỀN ĐÃ BỊ TRỪ TRONG VÍ KHÁCH mà đơn không chốt — phải báo lên màn hình
     * thu ngân, y như đường chuyển khoản ngân hàng đã làm.
     *
     * Bản cũ hai nhánh này chỉ ghi log rồi trả 204: khách trả xong, đơn treo, và
     * không một ai trong quán biết là tiền đã vào.
     */
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "payment:mismatch",
      payload: {
        paymentRequestId: request.id,
        orderId: request.order_id,
        receivedAmount: amountCents,
        expectedAmount: request.amount,
        currentDue: due,
      },
      timestamp: Date.now(),
    });

    return c.body(null, 204);
  }

  const settled = await finalizePaidRequest(request, {
    provider: "momo",
    providerTransactionId,
    paidAmountCents: amountCents,
    providerPayload: body,
    reference: orderId,
  });

  // MoMo gửi lại IPN là chuyện bình thường của họ. Không giành được quyền chốt
  // nghĩa là lượt trước đã ghi xong — trả 204 để MoMo thôi gửi lại.
  await log(true, settled ? "paid" : "already_paid", request.branch_id, request.id);

  return c.body(null, 204);
});

/**
 * Đối soát MoMo: hỏi lại MoMo trạng thái các yêu cầu còn treo.
 *
 * MoMo nói rõ IPN có thể không tới (mạng quán rớt, API đang deploy…). Không có
 * lưới này thì khách trả tiền xong mà đơn treo mãi, thu ngân phải bấm tay và dễ
 * thu nhầm lần hai.
 *
 * Đặt trong file này thay vì tách service riêng để tránh vòng import: nó cần
 * `finalizePaidRequest` + `currentDueForRequest` ở ngay đây.
 */
const MOMO_RECONCILE_INTERVAL_MS = 60_000;
/** Chờ chút cho IPN tới trước, khỏi hỏi thừa với đơn khách còn đang bấm. */
const MOMO_RECONCILE_MIN_AGE_MS = 2 * 60_000;

async function reconcileMomoOnce() {
  const now = new Date();
  const pending = await db
    .select()
    .from(schema.paymentRequests)
    .where(
      and(
        eq(schema.paymentRequests.provider, "momo"),
        eq(schema.paymentRequests.status, "pending"),
        gt(schema.paymentRequests.expires_at, now),
        lte(schema.paymentRequests.created_at, new Date(now.getTime() - MOMO_RECONCILE_MIN_AGE_MS)),
      ),
    )
    .limit(50);

  for (const request of pending) {
    try {
      const [branch] = await db
        .select()
        .from(schema.branches)
        .where(eq(schema.branches.id, request.branch_id))
        .limit(1);
      const momo = momoSettings(branch);
      if (!hasMomoCredentials(momo)) continue;

      const result = await queryMomoTransaction({
        ...momo,
        orderId: request.payment_code,
        requestId: crypto.randomUUID(),
      });
      if (result.resultCode !== 0) continue;

      const amountCents = Math.round(result.amount * 100);
      // So theo ĐỒNG — cùng lý do với nhánh IPN: số gửi sang MoMo đã làm tròn về
      // đồng, đơn có xu lẻ mà so theo xu thì không bao giờ đối soát được.
      if (centsToVnd(amountCents) !== centsToVnd(request.amount)) continue;

      const due = await currentDueForRequest(request);
      if (due === null || due !== request.amount) continue;

      // Chống đua với IPN vừa về: chỉ chốt nếu ngay lúc này vẫn còn pending.
      const [fresh] = await db
        .select({ status: schema.paymentRequests.status })
        .from(schema.paymentRequests)
        .where(eq(schema.paymentRequests.id, request.id))
        .limit(1);
      if (fresh?.status !== "pending") continue;

      const settled = await finalizePaidRequest(request, {
        provider: "momo",
        providerTransactionId: result.transId,
        paidAmountCents: amountCents,
        providerPayload: result.raw,
        reference: request.payment_code,
      });

      // IPN vừa về đúng lúc đối soát đang chạy — kiểm `fresh.status` ở trên
      // không đủ, vì giữa lúc kiểm và lúc ghi vẫn còn khe. Chốt nguyên tử bên
      // trong mới là thứ chặn thật; ở đây chỉ việc lặng lẽ đi tiếp.
      if (!settled) continue;

      await logWebhookEvent({
        provider: "momo",
        providerTransactionId: result.transId,
        paymentRequestId: request.id,
        branchId: request.branch_id,
        amount: amountCents,
        content: request.payment_code,
        matched: true,
        reason: "paid_via_reconcile",
        payload: result.raw,
      });

      logger.info("Đối soát MoMo bắt được giao dịch IPN chưa báo", {
        paymentRequestId: request.id,
        transId: result.transId,
      });
    } catch (err: any) {
      logger.warn("Đối soát MoMo lỗi cho một yêu cầu", {
        paymentRequestId: request.id,
        err: err?.message,
      });
    }
  }
}

export function startMomoReconciler() {
  setInterval(() => {
    reconcileMomoOnce().catch((err) =>
      logger.error("Vòng đối soát MoMo hỏng", { err: err?.message }),
    );
  }, MOMO_RECONCILE_INTERVAL_MS);
}

payments.use("*", authMiddleware);
payments.use("*", tenantMiddleware);
payments.use("*", requireBranch);

// GET /summary - Daily payment summary (must be before /:id)
//
// ⚠️ Đòi `reports:read` chứ KHÔNG phải `payments:read`: đây là DOANH THU CẢ NGÀY
// của quán (tổng thu, tiền mặt, thẻ, QR, tip), chỉ quản lý mới được xem. Thu ngân
// và phục vụ đều có `payments:read` để thu tiền, nên để quyền đó là hở số tổng.
// Các endpoint thanh toán khác giữ nguyên `payments:*` — thu ngân vẫn phải thu tiền được.
payments.get("/summary", requirePermission("reports:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const startOfDay = peruStartOfDay();
  const endOfDay = peruEndOfDay();

  const conditions = [
    eq(schema.payments.branch_id, tenant.branchId),
    eq(schema.payments.organization_id, tenant.organizationId),
    eq(schema.payments.status, "completed"),
    gte(schema.payments.created_at, startOfDay),
    lte(schema.payments.created_at, endOfDay),
  ];

  // Total by method
  const byMethod = await db
    .select({
      method: schema.payments.method,
      total: sum(schema.payments.amount),
      count: sql<number>`count(*)::int`,
    })
    .from(schema.payments)
    .where(and(...conditions))
    .groupBy(schema.payments.method);

  // Grand total and tip total
  const [totals] = await db
    .select({
      grand_total: sum(schema.payments.amount),
      tip_total: sum(schema.payments.tip),
      count: sql<number>`count(*)::int`,
    })
    .from(schema.payments)
    .where(and(...conditions));

  return c.json({
    success: true,
    data: {
      byMethod: byMethod.map((m) => ({
        method: m.method,
        total: Number(m.total || 0),
        count: m.count,
      })),
      grandTotal: Number(totals?.grand_total || 0),
      tipTotal: Number(totals?.tip_total || 0),
      totalCount: totals?.count || 0,
    },
  });
});

/**
 * GET /bridge-status — cầu nối thông báo ngân hàng còn sống không?
 *
 * `payments:read` chứ không phải quyền quản lý: THU NGÂN mới là người cần biết.
 * Không có gì nhạy cảm ở đây — chỉ là "còn sống hay không" và bao lâu rồi.
 */
payments.get("/bridge-status", requirePermission("payments:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const [branch] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId))
    .limit(1);

  const cfg = ((branch?.settings || {}) as Record<string, any>).payment?.bank_push || {};
  const enabled = Boolean(cfg.enabled);

  if (!enabled) {
    return c.json({ success: true, data: { enabled: false, healthy: true } });
  }

  const [beat] = await db
    .select()
    .from(schema.bridgeHeartbeats)
    .where(eq(schema.bridgeHeartbeats.branch_id, tenant.branchId))
    .limit(1);

  /*
   * Chưa từng nhận nhịp thở nào = điện thoại đang chạy bản APK CŨ (trước 1.1),
   * bản đó không biết gửi nhịp thở.
   *
   * Trường hợp này KHÔNG được báo đỏ: bản cũ vẫn chuyển tiền về bình thường, mà
   * cứ vắng khách 15 phút là POS kêu thì nhân viên sẽ thôi không nhìn nữa — lúc
   * hỏng thật cũng chẳng ai tin. Có được nhịp đầu tiên rồi thì bản ghi nằm đó
   * vĩnh viễn, từ đó mới bắt đầu canh.
   */
  if (!beat) {
    return c.json({
      success: true,
      data: { enabled: true, healthy: true, awaitingFirstBeat: true },
    });
  }

  // Một thông báo ngân hàng THẬT cũng là bằng chứng còn sống — thường tới sớm
  // hơn nhịp thở kế tiếp nên lấy mốc nào mới hơn.
  const [lastEvent] = await db
    .select({ created_at: schema.paymentWebhookEvents.created_at })
    .from(schema.paymentWebhookEvents)
    .where(
      and(
        eq(schema.paymentWebhookEvents.provider, "bank_push"),
        eq(schema.paymentWebhookEvents.branch_id, tenant.branchId),
      ),
    )
    .orderBy(desc(schema.paymentWebhookEvents.created_at))
    .limit(1);

  const candidates = [beat?.last_seen_at, lastEvent?.created_at]
    .filter(Boolean)
    .map((d) => new Date(d as any).getTime());
  const lastSeenMs = candidates.length ? Math.max(...candidates) : null;
  const minutesSince = lastSeenMs === null ? null : Math.floor((Date.now() - lastSeenMs) / 60000);

  // Nhịp thở 5 phút một lần, ngưỡng 15 phút — phải HỤT BA NHỊP LIỀN mới báo đỏ,
  // để một lần chập 4G không làm POS kêu oan.
  const healthy =
    minutesSince !== null && minutesSince <= BRIDGE_STALE_MINUTES && beat?.listener_ok !== false;

  return c.json({
    success: true,
    data: {
      enabled: true,
      healthy,
      lastSeenAt: lastSeenMs === null ? null : new Date(lastSeenMs).toISOString(),
      minutesSince,
      queueSize: beat?.queue_size ?? 0,
      listenerOk: beat?.listener_ok !== false,
      appVersion: beat?.app_version || null,
    },
  });
});

// GET /unpaid-orders - Orders pending payment (for payment dialog selector)
payments.get("/unpaid-orders", requirePermission("payments:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const result = await db
    .select({
      id: schema.orders.id,
      order_number: schema.orders.order_number,
      customer_name: schema.orders.customer_name,
      total: schema.orders.total,
      status: schema.orders.status,
      created_at: schema.orders.created_at,
      total_paid: sql<number>`COALESCE((SELECT SUM(amount)::int FROM payments WHERE payments.order_id = ${schema.orders.id} AND payments.status = 'completed'), 0)`,
      table_number: schema.tables.number,
    })
    .from(schema.orders)
    .leftJoin(schema.tableSessions, eq(schema.orders.table_session_id, schema.tableSessions.id))
    .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        eq(schema.orders.organization_id, tenant.organizationId),
        sql`${schema.orders.status} != 'cancelled'`,
      ),
    )
    .orderBy(desc(schema.orders.created_at))
    .limit(50);

  // Filter to only unpaid/partial orders
  const unpaid = result
    .filter((o) => o.total_paid < o.total)
    .map((o) => ({
      ...o,
      remaining: o.total - o.total_paid,
    }));

  return c.json({ success: true, data: unpaid });
});

// POST /requests - Create or reuse a 60-minute bank transfer QR payment request.
payments.post(
  "/requests",
  requirePermission("payments:create"),
  blockLiveOps,
  zValidator("json", createPaymentRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const now = new Date();
    // Máy khách cũ không gửi trường này → giữ nguyên hành vi QR ngân hàng.
    const provider = body.provider || "sepay";

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, body.orderId),
          eq(schema.orders.branch_id, tenant.branchId),
          eq(schema.orders.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "order_not_found") } },
        404,
      );
    }

    if (order.status === "completed" || order.status === "cancelled") {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: t(c, "order_paid") } },
        400,
      );
    }

    /*
     * ⭐ SỐ TIỀN DO MÁY CHỦ TỰ TÍNH. Cố ý BỎ QUA `body.amount`.
     *
     * ⚠️ Bản cũ lấy thẳng `body.amount || remaining || order.total`, mà `remaining`
     * lại chỉ tính RIÊNG MỘT ĐƠN trong khi lúc nhận tiền đòi khớp tổng CẢ BÀN.
     * Hai thước đo khác nhau ở hai đầu → in ra được tờ phiếu mà chính máy chủ
     * không bao giờ chấp nhận. Sáng 05/08/2026 bàn 13 in phiếu 70.000đ khi bàn
     * nợ 85.000đ; khách chuyển đúng 70.000đ rồi bị từ chối, bàn treo 31 phút.
     *
     * Con số máy POS gửi lên không đáng tin: nó đọc từ bộ nhớ đệm trên máy, bấm
     * nhanh sau khi mở bàn là gửi số cũ. Máy chủ mới là nơi biết sự thật.
     */
    const breakdown = await dueBreakdown(order.id);
    const amount = breakdown?.due ?? 0;

    // Vẫn nhận trường `amount` cho máy khách cũ, nhưng chỉ để GHI LẠI khi lệch.
    // Đây là cái chuông báo bộ nhớ đệm phía POS đang cũ — im lặng bỏ qua thì lần
    // sau lại phải đi dò từ đầu như hôm nay.
    if (body.amount && body.amount !== amount) {
      logger.warn("Máy POS xin phiếu QR với số tiền lệch — đã dùng số của máy chủ", {
        orderId: order.id,
        posGuiLen: body.amount,
        mayChuTinh: amount,
      });
    }

    if (amount <= 0) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: t(c, "order_paid") } },
        400,
      );
    }

    await db
      .update(schema.paymentRequests)
      .set({ status: "expired", updated_at: now })
      .where(
        and(
          eq(schema.paymentRequests.order_id, order.id),
          eq(schema.paymentRequests.status, "pending"),
          lte(schema.paymentRequests.expires_at, now),
        ),
      );

    await db
      .update(schema.paymentRequests)
      .set({ status: "cancelled", cancelled_at: now, updated_at: now })
      .where(
        and(
          eq(schema.paymentRequests.order_id, order.id),
          eq(schema.paymentRequests.status, "pending"),
          sql`${schema.paymentRequests.amount} <> ${amount}`,
        ),
      );

    const [branch] = await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);

    // ⚠️ PHẢI lọc theo provider. Thu ngân in QR ngân hàng rồi bấm sang MoMo cho
    // cùng đơn đó thì không có bộ lọc này sẽ trả về đúng cái yêu cầu SePay cũ —
    // khách nhận QR ngân hàng trong khi màn hình bảo quét MoMo.
    const [active] = await db
      .select()
      .from(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.order_id, order.id),
          eq(schema.paymentRequests.branch_id, tenant.branchId),
          eq(schema.paymentRequests.provider, provider),
          eq(schema.paymentRequests.status, "pending"),
          gt(schema.paymentRequests.expires_at, now),
        ),
      )
      .orderBy(desc(schema.paymentRequests.created_at))
      .limit(1);

    if (active && provider === "momo") {
      // Dùng lại nguyên chuỗi QR đã lưu. TUYỆT ĐỐI không gọi lại MoMo: MoMo đòi
      // orderId duy nhất, mà orderId ở đây chính là payment_code đang giữ nguyên
      // → lần gọi thứ hai sẽ bị từ chối vì trùng đơn.
      //
      // Gọi lại lượt hai chính là nút "In lại phiếu" — in thêm một tờ giống hệt,
      // KHÔNG sinh mã mới, nên hai tờ cùng payment_code và tiền về vẫn khớp đơn.
      await broadcastTransferPrint({
        branchId: tenant.branchId,
        orderId: order.id,
        request: active,
        provider,
        bank: null,
      });
      return c.json({
        success: true,
        data: { ...active, reused: true, bank: null },
      });
    }

    if (active) {
      const transfer = buildTransferPayload(branch, active.payment_code, active.amount);
      // Tính lại mã QR thay vì dùng lại chuỗi đã lưu: các yêu cầu tạo trước bản vá
      // còn giữ payload cũ (link ảnh) trong DB, quét sẽ báo "mã không hợp lệ".
      if (transfer.qrPayload && transfer.qrPayload !== active.qr_payload) {
        await db
          .update(schema.paymentRequests)
          .set({ qr_payload: transfer.qrPayload, qr_url: transfer.qrUrl })
          .where(eq(schema.paymentRequests.id, active.id));
      }
      const reusedBank = {
        bankCode: transfer.bankCode,
        accountNumber: transfer.accountNumber,
        accountName: transfer.accountName,
        amountVnd: transfer.amountVnd,
        addInfo: transfer.addInfo,
      };
      await broadcastTransferPrint({
        branchId: tenant.branchId,
        orderId: order.id,
        // Gửi payload vừa tính lại, không phải chuỗi cũ trong DB — yêu cầu tạo
        // trước bản vá còn giữ link ảnh, in ra là quét báo mã không hợp lệ.
        request: { ...active, qr_payload: transfer.qrPayload, qr_url: transfer.qrUrl },
        provider,
        bank: reusedBank,
      });
      return c.json({
        success: true,
        data: {
          ...active,
          qr_payload: transfer.qrPayload,
          qr_url: transfer.qrUrl,
          reused: true,
          bank: {
            bankCode: transfer.bankCode,
            accountNumber: transfer.accountNumber,
            accountName: transfer.accountName,
            amountVnd: transfer.amountVnd,
            addInfo: transfer.addInfo,
          },
        },
      });
    }

    const paymentCode = randomPaymentCode(order.order_number);
    const expiresAt = new Date(now.getTime() + PAYMENT_REQUEST_TTL_MS);

    if (provider === "momo") {
      const momo = momoSettings(branch);
      if (!momo.enabled || !hasMomoCredentials(momo)) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Chi nhánh chưa bật MoMo. Vào Cài đặt → Chi nhánh để nhập khóa MoMo.",
            },
          },
          400,
        );
      }

      const amountVnd = centsToVnd(amount);
      if (amountVnd < MOMO_MIN_VND || amountVnd > MOMO_MAX_VND) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: `MoMo chỉ nhận từ ${MOMO_MIN_VND.toLocaleString("vi-VN")}đ đến ${MOMO_MAX_VND.toLocaleString("vi-VN")}đ. Đơn này ${amountVnd.toLocaleString("vi-VN")}đ — thu bằng cách khác.`,
            },
          },
          400,
        );
      }

      let momoResult;
      try {
        momoResult = await createMomoPayment({
          ...momo,
          orderId: paymentCode,
          // requestId phải MỚI mỗi lần gọi, khác orderId.
          requestId: crypto.randomUUID(),
          amountVnd,
          orderInfo: `Thanh toan don ${order.order_number}`,
          ipnUrl: `${(process.env.PUBLIC_API_URL || "").replace(/\/+$/, "")}/api/payments/webhooks/momo`,
          redirectUrl: (process.env.PUBLIC_WEB_URL || "").replace(/\/+$/, "") || "https://momo.vn",
        });
      } catch (err: any) {
        // KHÔNG tạo payment_request khi MoMo lỗi — để lại một yêu cầu không có mã
        // QR thì thu ngân thấy màn hình chờ trống rỗng, tưởng máy treo.
        logger.error("Không tạo được giao dịch MoMo", {
          orderId: order.id,
          branchId: tenant.branchId,
          err: err?.message,
        });
        return c.json(
          {
            success: false,
            error: { code: "PAYMENT_GATEWAY_ERROR", message: err?.message || "MoMo không phản hồi" },
          },
          502,
        );
      }

      const [createdMomo] = await db
        .insert(schema.paymentRequests)
        .values({
          order_id: order.id,
          organization_id: tenant.organizationId,
          branch_id: tenant.branchId,
          provider: "momo",
          payment_code: paymentCode,
          amount,
          status: "pending",
          // Đây là CHUỖI để vẽ QR, không phải link ảnh.
          qr_payload: momoResult.qrCodeUrl,
          qr_url: null,
          expires_at: expiresAt,
        })
        .returning();

      await broadcastTransferPrint({
        branchId: tenant.branchId,
        orderId: order.id,
        request: createdMomo,
        provider,
        bank: null,
      });

      return c.json({ success: true, data: { ...createdMomo, reused: false, bank: null } }, 201);
    }

    const transfer = buildTransferPayload(branch, paymentCode, amount);

    const [created] = await db
      .insert(schema.paymentRequests)
      .values({
        order_id: order.id,
        organization_id: tenant.organizationId,
        branch_id: tenant.branchId,
        provider: "sepay",
        payment_code: paymentCode,
        amount,
        status: "pending",
        qr_payload: transfer.qrPayload,
        qr_url: transfer.qrUrl,
        expires_at: expiresAt,
      })
      .returning();

    const bank = {
      bankCode: transfer.bankCode,
      accountNumber: transfer.accountNumber,
      accountName: transfer.accountName,
      amountVnd: transfer.amountVnd,
      addInfo: transfer.addInfo,
    };

    await broadcastTransferPrint({
      branchId: tenant.branchId,
      orderId: order.id,
      request: created,
      provider,
      bank,
    });

    return c.json({ success: true, data: { ...created, reused: false, bank } }, 201);
  },
);

// GET /requests/:id - Get payment request status.
/**
 * Phiếu QR còn hiệu lực của MỘT đơn (nếu có).
 *
 * Sinh ra để chữa cảnh này: thu ngân in phiếu QR, đóng hộp thoại, mở lại thì mã
 * QR biến mất (id chỉ nằm trong state của hộp thoại) và phương thức nhảy về Tiền
 * mặt. Muốn quay lại luồng chuyển khoản phải in thêm một phiếu nữa — nên đường
 * dễ nhất thành ra bấm Tiền mặt/Thẻ. Đo trên dữ liệu thật 26-29/07: 41 phiếu QR
 * in ra thì 31 đơn bị ghi thành Thẻ, chỉ 1 đơn ghi đúng Chuyển khoản.
 *
 * Không tìm thấy thì trả `data: null` chứ KHÔNG 404 — "đơn này chưa in phiếu QR"
 * là chuyện thường ngày, không phải lỗi để client phải bắt.
 *
 * Đặt TRƯỚC `/requests/:id` để khỏi phải nghĩ về thứ tự khớp đường dẫn.
 */
payments.get("/requests/by-order/:orderId", requirePermission("payments:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const orderId = c.req.param("orderId");
  const now = new Date();

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(
      and(
        eq(schema.paymentRequests.order_id, orderId),
        eq(schema.paymentRequests.branch_id, tenant.branchId),
        eq(schema.paymentRequests.status, "pending"),
        gt(schema.paymentRequests.expires_at, now),
      ),
    )
    .orderBy(desc(schema.paymentRequests.created_at))
    .limit(1);

  if (!request) return c.json({ success: true, data: null });

  // Cùng chốt chặn với GET /requests/:id — xem chú thích đầy đủ ở dưới đó.
  // Thiếu chỗ này thì mở lại hộp thoại là nhận về đúng cái phiếu đã lệch số tiền,
  // rồi bấm "In lại phiếu" in ra y hệt tờ giấy sai.
  const due = await currentDueForRequest(request);
  if (due !== request.amount) {
    await db
      .update(schema.paymentRequests)
      .set({ status: "cancelled", cancelled_at: now, updated_at: now })
      .where(eq(schema.paymentRequests.id, request.id));
    logger.info("Bỏ phiếu QR cũ vì món trên bàn đã đổi", {
      paymentRequestId: request.id,
      tienTrenPhieu: request.amount,
      tienBanDangNo: due,
    });
    return c.json({ success: true, data: null });
  }

  // Chuyển khoản ngân hàng cần khối `bank` để in lại phiếu; MoMo thì tiền vào ví
  // nên không có số tài khoản nào để in.
  let bank = null;
  if (request.provider !== "momo") {
    const [branch] = await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    const transfer = buildTransferPayload(branch, request.payment_code, request.amount);
    bank = {
      bankCode: transfer.bankCode,
      accountNumber: transfer.accountNumber,
      accountName: transfer.accountName,
      amountVnd: transfer.amountVnd,
      addInfo: transfer.addInfo,
    };
  }

  return c.json({ success: true, data: { ...request, bank } });
});

payments.get("/requests/:id", requirePermission("payments:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const id = c.req.param("id");
  const now = new Date();

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(and(eq(schema.paymentRequests.id, id), eq(schema.paymentRequests.branch_id, tenant.branchId)))
    .limit(1);

  if (!request) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Payment request not found" } },
      404,
    );
  }

  if (request.status === "pending" && now > request.expires_at) {
    const [expired] = await db
      .update(schema.paymentRequests)
      .set({ status: "expired", updated_at: now })
      .where(eq(schema.paymentRequests.id, request.id))
      .returning();
    return c.json({ success: true, data: expired });
  }

  /*
   * ⭐ Phiếu QR TỰ HUỶ khi số tiền không còn đúng.
   *
   * Đặt chốt chặn ở đường ĐỌC chứ không đi gắn vào từng chỗ sửa món (thêm món,
   * tách bàn, huỷ đơn, thu tiền mặt một phần…). Gắn từng chỗ thì chỉ cần quên
   * một chỗ là lỗi quay lại, mà quên chỗ nào thì không ai biết cho tới khi có
   * khách chuyển tiền hụt. Hộp thoại thanh toán hỏi lại phiếu này mỗi 5 giây,
   * nên mọi đường làm lệch số tiền đều bị bắt trong vòng 5 giây — kể cả đường
   * mai mốt mới viết.
   *
   * Vẫn còn hai lớp nữa phía sau: lúc tiền về `settleMatchedRequest` so lại lần
   * nữa, và nếu lệch thì bắn `payment:mismatch` cho thu ngân.
   */
  if (request.status === "pending") {
    const due = await currentDueForRequest(request);
    if (due !== request.amount) {
      const [cancelled] = await db
        .update(schema.paymentRequests)
        .set({ status: "cancelled", cancelled_at: now, updated_at: now })
        .where(eq(schema.paymentRequests.id, request.id))
        .returning();
      logger.info("Huỷ phiếu QR vì món trên bàn đã đổi sau khi in", {
        paymentRequestId: request.id,
        tienTrenPhieu: request.amount,
        tienBanDangNo: due,
      });
      return c.json({ success: true, data: { ...cancelled, stale_reason: "amount_changed", current_due: due } });
    }
  }

  return c.json({ success: true, data: request });
});

// GET / - List payments for branch with optional filters
payments.get("/", requirePermission("payments:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const method = c.req.query("method");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  const conditions: any[] = [
    eq(schema.payments.branch_id, tenant.branchId),
    eq(schema.payments.organization_id, tenant.organizationId),
  ];

  if (method) {
    conditions.push(eq(schema.payments.method, method as any));
  }
  if (startDate) {
    conditions.push(gte(schema.payments.created_at, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(schema.payments.created_at, new Date(endDate)));
  }

  const result = await db
    .select({
      id: schema.payments.id,
      order_id: schema.payments.order_id,
      organization_id: schema.payments.organization_id,
      branch_id: schema.payments.branch_id,
      method: schema.payments.method,
      amount: schema.payments.amount,
      reference: schema.payments.reference,
      tip: schema.payments.tip,
      status: schema.payments.status,
      created_at: schema.payments.created_at,
      order_number: schema.orders.order_number,
    })
    .from(schema.payments)
    .leftJoin(schema.orders, eq(schema.payments.order_id, schema.orders.id))
    .where(and(...conditions))
    .orderBy(desc(schema.payments.created_at))
    .limit(100);

  return c.json({ success: true, data: result });
});

// POST / - Create payment (supports partial payments)
payments.post(
  "/",
  requirePermission("payments:create"),
  blockLiveOps,
  zValidator("json", createPaymentSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Verify order belongs to branch
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, body.orderId),
          eq(schema.orders.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "order_not_found") } },
        404,
      );
    }

    // Sum previous payments for this order
    const [prevPayments] = await db
      .select({
        total_paid: sum(schema.payments.amount),
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.order_id, body.orderId),
          eq(schema.payments.status, "completed"),
        ),
      );

    const previouslyPaid = Number(prevPayments?.total_paid || 0);

    const remaining = order.total - previouslyPaid;

    let amountToDistribute = body.amount;
    // Kiểu khai báo tường minh: bên dưới có đọc `paymentsCreated.length` ngay trong
    // lượt insert, để TypeScript tự suy kiểu thì thành vòng lặp suy diễn.
    const paymentsCreated: any[] = [];
    let fullyPaid = false;

    if (order.table_session_id) {
      const tableSessionId = order.table_session_id;
      // Fetch all unpaid/partially paid orders in the same session
      const sessionOrders = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.table_session_id, tableSessionId),
            sql`orders.status NOT IN ('completed', 'cancelled')`
          )
        )
        .orderBy(schema.orders.created_at);

      // Sort so that the requested order is paid first, then others
      const sortedOrders = [
        order,
        ...sessionOrders.filter(o => o.id !== order.id)
      ];

      for (const o of sortedOrders) {
        if (amountToDistribute <= 0) break;

        const written = await insertManualPayment({
          orderId: o.id,
          orderTotal: o.total,
          organizationId: tenant.organizationId,
          branchId: tenant.branchId,
          method: body.method,
          want: amountToDistribute,
          reference: body.reference,
          /*
           * Boa gắn vào dòng thu ĐẦU TIÊN của lượt này.
           *
           * ⚠️ Bản cũ gắn vào "đơn đích" (`o.id === order.id`). Nhưng vòng lặp bỏ
           * qua đơn đã trả đủ — thu ngân bấm thanh toán trên đơn đã xong để trả
           * nốt đơn khác trong phiên thì dòng mang boa KHÔNG BAO GIỜ được tạo,
           * tiền boa khách đưa biến mất khỏi hệ thống.
           */
          tip: paymentsCreated.length === 0 ? body.tip : 0,
        });

        if (!written) continue;

        const { payment, payAmount, previouslyPaid: oPreviouslyPaid } = written;
        amountToDistribute -= payAmount;
        paymentsCreated.push(payment);

        if (oPreviouslyPaid + payAmount >= o.total) {
          // Update order status to completed
          await db
            .update(schema.orders)
            .set({ status: "completed", updated_at: new Date() })
            .where(eq(schema.orders.id, o.id));
          // Trừ kho + tích điểm (idempotent, tự nuốt lỗi — không fail thanh toán)
          await runCompletionSideEffects([o], tenant.organizationId, tenant.branchId);
        }
      }

      // Check if ALL orders in the session are now completed
      const otherUncompletedOrders = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.table_session_id, tableSessionId),
            sql`orders.status NOT IN ('completed', 'cancelled')`
          )
        );

      if (otherUncompletedOrders.length === 0) {
        fullyPaid = true;
        // Close session and free table
        const [session] = await db
          .select({ table_id: schema.tableSessions.table_id })
          .from(schema.tableSessions)
          .where(eq(schema.tableSessions.id, tableSessionId))
          .limit(1);

        await db.transaction(async (tx) => {
          await tx
            .update(schema.tableSessions)
            .set({ status: "completed", ended_at: new Date() })
            .where(eq(schema.tableSessions.id, tableSessionId));

          if (session) {
            await tx
              .update(schema.tables)
              .set({ status: "available" })
              .where(eq(schema.tables.id, session.table_id));
          }
        });

        if (session) {
          // Broadcast session ended and table status
          await wsManager.publish(`branch:${tenant.branchId}`, {
            type: "session:ended",
            payload: { sessionId: tableSessionId, tableId: session.table_id },
            timestamp: Date.now(),
          });
          await wsManager.publish(`branch:${tenant.branchId}`, {
            type: "table:status",
            payload: { tableId: session.table_id, status: "available" },
            timestamp: Date.now(),
          });
        }
      }
    } else {
      // Normal single order payment (takeout, etc.)
      if (remaining <= 0) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: t(c, "order_paid") } },
          400,
        );
      }

      const written = await insertManualPayment({
        orderId: body.orderId,
        orderTotal: order.total,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        method: body.method,
        want: amountToDistribute,
        reference: body.reference,
        tip: body.tip,
      });

      // Lượt bấm trước vừa thu đủ đơn này (bấm hai lần thật nhanh) — không ghi thêm.
      if (!written) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: t(c, "order_paid") } },
          400,
        );
      }

      const { payment, payAmount } = written;
      paymentsCreated.push(payment);
      fullyPaid = (written.previouslyPaid + payAmount) >= order.total;

      if (fullyPaid) {
        await db
          .update(schema.orders)
          .set({ status: "completed", updated_at: new Date() })
          .where(eq(schema.orders.id, order.id));
        // Trừ kho + tích điểm (idempotent, tự nuốt lỗi — không fail thanh toán)
        await runCompletionSideEffects([order], tenant.organizationId, tenant.branchId);
      }
    }

    const firstPayment = paymentsCreated[0] || {};
    const totalPaid = order.table_session_id
      ? (previouslyPaid + (firstPayment.amount || 0))
      : (previouslyPaid + (firstPayment.amount || 0));

    return c.json({
      success: true,
      data: {
        ...firstPayment,
        order_number: order.order_number,
        order_total: order.total,
        total_paid: totalPaid,
        remaining: Math.max(0, order.total - totalPaid),
        fully_paid: fullyPaid,
      },
    }, 201);
  },
);

// GET /:id - Get payment details with order info
payments.get(
  "/:id",
  requirePermission("payments:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [result] = await db
      .select({
        id: schema.payments.id,
        order_id: schema.payments.order_id,
        organization_id: schema.payments.organization_id,
        branch_id: schema.payments.branch_id,
        method: schema.payments.method,
        amount: schema.payments.amount,
        reference: schema.payments.reference,
        tip: schema.payments.tip,
        status: schema.payments.status,
        created_at: schema.payments.created_at,
        order_number: schema.orders.order_number,
        order_total: schema.orders.total,
        order_status: schema.orders.status,
      })
      .from(schema.payments)
      .leftJoin(schema.orders, eq(schema.payments.order_id, schema.orders.id))
      .where(
        and(
          eq(schema.payments.id, id),
          eq(schema.payments.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!result) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "payment_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: result });
  },
);

export { payments };
