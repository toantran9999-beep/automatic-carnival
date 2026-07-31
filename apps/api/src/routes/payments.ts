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

function webhookAmountCents(body: any) {
  const raw = body.transferAmount ?? body.transfer_amount ?? body.amount ?? body.value ?? 0;
  const parsed = Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
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
  if (data.providerTransactionId) {
    const [existing] = await db
      .select({ id: schema.paymentWebhookEvents.id })
      .from(schema.paymentWebhookEvents)
      .where(
        and(
          eq(schema.paymentWebhookEvents.provider, data.provider),
          eq(schema.paymentWebhookEvents.provider_transaction_id, data.providerTransactionId),
        ),
      )
      .limit(1);
    if (existing) return;
  }

  await db.insert(schema.paymentWebhookEvents).values({
    provider: data.provider,
    provider_transaction_id: data.providerTransactionId || null,
    payment_request_id: data.paymentRequestId || null,
    branch_id: data.branchId || null,
    amount: data.amount,
    content: data.content,
    matched: data.matched,
    reason: data.reason,
    payload: data.payload as any,
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
    const sessionOrders = await tx
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, order.table_session_id),
          sql`orders.status NOT IN ('completed', 'cancelled')`,
        ),
      )
      .orderBy(schema.orders.created_at);

    const sortedOrders = [order, ...sessionOrders.filter((o: any) => o.id !== order.id)];
    for (const o of sortedOrders) {
      await payOrder(o);
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
async function currentDueForRequest(request: any): Promise<number | null> {
  const [order] = await db
    .select({
      total: schema.orders.total,
      status: schema.orders.status,
      table_session_id: schema.orders.table_session_id,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, request.order_id))
    .limit(1);

  if (!order || order.status === "cancelled") return null;

  if (order.table_session_id) {
    const sessionDueRows = await db
      .select({
        total: schema.orders.total,
        total_paid: sql<number>`COALESCE((SELECT SUM(amount)::int FROM payments WHERE payments.order_id = ${schema.orders.id} AND payments.status = 'completed'), 0)`,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, order.table_session_id),
          sql`orders.status != 'cancelled'`,
        ),
      );
    return sessionDueRows.reduce(
      (sum, row) => sum + Math.max(0, row.total - Number(row.total_paid || 0)),
      0,
    );
  }

  const [paid] = await db
    .select({ total_paid: sum(schema.payments.amount) })
    .from(schema.payments)
    .where(and(eq(schema.payments.order_id, request.order_id), eq(schema.payments.status, "completed")));
  return Math.max(0, order.total - Number(paid?.total_paid || 0));
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
 * Chốt đơn khi tiền đã thực sự vào: ghi payment, đóng đơn, đóng phiên bàn, nhả
 * bàn, trừ kho, tích điểm, rồi báo mọi máy.
 *
 * Dùng chung cho CẢ BA đường tiền vào (SePay webhook / MoMo IPN / đối soát định
 * kỳ). Đừng chép lại logic này ở đường thứ tư — ba đường lệch nhau là nguồn gốc
 * của cảnh "đơn chốt nhưng bàn không dọn".
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
    const completed = await completePaymentForOrder(tx, {
      orderId: request.order_id,
      organizationId: request.organization_id,
      branchId: request.branch_id,
      amount: request.amount,
      reference: args.reference,
    });

    await tx
      .update(schema.paymentRequests)
      .set({
        status: "paid",
        paid_amount: args.paidAmountCents,
        provider_transaction_id: args.providerTransactionId || null,
        provider_payload: args.providerPayload as any,
        paid_at: now,
        updated_at: now,
      })
      .where(eq(schema.paymentRequests.id, request.id));

    return completed;
  });

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

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(
      or(
        inArray(schema.paymentRequests.payment_code, codes),
        // Kênh DIRECT_DEBITS và một số QR liên ngân hàng XOÁ SẠCH gạch nối trong
        // nội dung. Không so thêm bản đã làm phẳng thì những giao dịch đó không
        // bao giờ khớp — khách trả tiền mà bàn treo mãi.
        inArray(sql`REPLACE(${schema.paymentRequests.payment_code}, '-', '')`, flattened),
      ),
    )
    .orderBy(
      sql`CASE WHEN payment_requests.status = 'pending' THEN 0 ELSE 1 END`,
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
    return { matched: false, reason: "stale_order_amount" };
  }

  if (args.amountCents < request.amount) {
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

  await finalizePaidRequest(request, {
    provider: args.provider,
    providerTransactionId: args.providerTransactionId,
    paidAmountCents: args.amountCents,
    providerPayload: args.payload,
    // Ghi mã ĐÃ LƯU chứ không phải mã bóc từ thông báo: kênh chuyển tiền có thể
    // đã xoá gạch nối, sổ sách phải mang mã gốc để đối chiếu với phiếu đã in.
    reference: request.payment_code,
  });

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
  const toVnd = (raw: string) => {
    const parsed = Number(raw.replace(/[.,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

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
payments.post("/webhooks/bank-push", async (c) => {
  const rawBody = await c.req.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }

  const branchId = normalizeText(c.req.header("x-toda-branch") || body.branchId);
  const providedKey = normalizeText(c.req.header("x-toda-bridge-key"));

  if (!branchId) return c.json({ success: false, error: "missing branch" }, 401);

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
    return c.json({ success: false, error: "bank push not configured" }, 401);
  }

  const keyMatches =
    providedKey.length === expectedKey.length &&
    timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey));
  if (!keyMatches) return c.json({ success: false, error: "invalid key" }, 401);

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

  if (amountCents !== request.amount) {
    await log(false, "amount_mismatch", request.branch_id, request.id);
    return c.body(null, 204);
  }

  // Đơn có thể đã được thu tiền mặt / gọi thêm món sau khi dựng QR. Chốt tiếp là
  // ghi thừa một khoản thu không có thật vào sổ.
  const due = await currentDueForRequest(request);
  if (due === null || due !== request.amount) {
    await db
      .update(schema.paymentRequests)
      .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
      .where(eq(schema.paymentRequests.id, request.id));
    await log(false, "stale_order_amount", request.branch_id, request.id);
    return c.body(null, 204);
  }

  await finalizePaidRequest(request, {
    provider: "momo",
    providerTransactionId,
    paidAmountCents: amountCents,
    providerPayload: body,
    reference: orderId,
  });

  await log(true, "paid", request.branch_id, request.id);

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
      if (amountCents !== request.amount) continue;

      const due = await currentDueForRequest(request);
      if (due === null || due !== request.amount) continue;

      // Chống đua với IPN vừa về: chỉ chốt nếu ngay lúc này vẫn còn pending.
      const [fresh] = await db
        .select({ status: schema.paymentRequests.status })
        .from(schema.paymentRequests)
        .where(eq(schema.paymentRequests.id, request.id))
        .limit(1);
      if (fresh?.status !== "pending") continue;

      await finalizePaidRequest(request, {
        provider: "momo",
        providerTransactionId: result.transId,
        paidAmountCents: amountCents,
        providerPayload: result.raw,
        reference: request.payment_code,
      });

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

    const [paid] = await db
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(and(eq(schema.payments.order_id, order.id), eq(schema.payments.status, "completed")));
    const remaining = Math.max(0, order.total - Number(paid?.total_paid || 0));
    const amount = body.amount || remaining || order.total;

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

    return c.json({
      success: true,
      data: {
        ...created,
        reused: false,
        bank: {
          bankCode: transfer.bankCode,
          accountNumber: transfer.accountNumber,
          accountName: transfer.accountName,
          amountVnd: transfer.amountVnd,
          addInfo: transfer.addInfo,
        },
      },
    }, 201);
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
    const paymentsCreated = [];
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

        // Sum previous payments for this specific order
        const [prevOPayments] = await db
          .select({ total_paid: sum(schema.payments.amount) })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.order_id, o.id),
              eq(schema.payments.status, "completed")
            )
          );

        const oPreviouslyPaid = Number(prevOPayments?.total_paid || 0);
        const orderRemaining = o.total - oPreviouslyPaid;

        if (orderRemaining <= 0) continue;

        const payAmount = Math.min(amountToDistribute, orderRemaining);
        amountToDistribute -= payAmount;

        const [payment] = await db
          .insert(schema.payments)
          .values({
            order_id: o.id,
            organization_id: tenant.organizationId,
            branch_id: tenant.branchId,
            method: body.method,
            amount: payAmount,
            reference: body.reference,
            tip: o.id === order.id ? body.tip : 0, // only apply tip to the main order
            status: "completed",
          })
          .returning();

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

      const payAmount = Math.min(amountToDistribute, remaining);
      const [payment] = await db
        .insert(schema.payments)
        .values({
          order_id: body.orderId,
          organization_id: tenant.organizationId,
          branch_id: tenant.branchId,
          method: body.method,
          amount: payAmount,
          reference: body.reference,
          tip: body.tip,
          status: "completed",
        })
        .returning();

      paymentsCreated.push(payment);
      fullyPaid = (previouslyPaid + payAmount) >= order.total;

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
