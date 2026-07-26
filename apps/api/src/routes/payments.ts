import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, gte, lte, gt, sql, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { createPaymentRequestSchema, createPaymentSchema, idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission, blockLiveOps } from "../middleware/rbac.js";
import { peruStartOfDay, peruEndOfDay } from "../lib/timezone.js";
import { buildVietQrPayload, resolveBankBin, bankDisplayName } from "@restai/config";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";
import { handleOrderCompletion } from "../services/order.service.js";

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

function extractPaymentCode(content: string) {
  return content.match(/\bTODA-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase() || "";
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

async function logWebhookEvent(data: {
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
          eq(schema.paymentWebhookEvents.provider, "sepay"),
          eq(schema.paymentWebhookEvents.provider_transaction_id, data.providerTransactionId),
        ),
      )
      .limit(1);
    if (existing) return;
  }

  await db.insert(schema.paymentWebhookEvents).values({
    provider: "sepay",
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

// Public SePay webhook. This must stay before auth middleware.
payments.post("/webhooks/sepay", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const providerTransactionId = webhookTransactionId(body);
  const amount = webhookAmountCents(body);
  const content = webhookContent(body);
  const paymentCode = extractPaymentCode(content);
  const transferType = normalizeText(body.transferType || body.transfer_type).toLowerCase();

  if (transferType && transferType !== "in") {
    await logWebhookEvent({ providerTransactionId, amount, content, matched: false, reason: "ignored_transfer_type", payload: body });
    return c.json({ success: true });
  }

  if (!paymentCode) {
    await logWebhookEvent({ providerTransactionId, amount, content, matched: false, reason: "missing_payment_code", payload: body });
    return c.json({ success: true });
  }

  const [request] = await db
    .select()
    .from(schema.paymentRequests)
    .where(eq(schema.paymentRequests.payment_code, paymentCode))
    .limit(1);

  if (!request) {
    await logWebhookEvent({ providerTransactionId, amount, content, matched: false, reason: "payment_request_not_found", payload: body });
    return c.json({ success: true });
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, request.branch_id))
    .limit(1);
  const sepay = paymentSettings(branch);
  const expectedSecret = normalizeText(sepay.webhook_secret || sepay.webhookSecret || sepay.api_key || sepay.apiKey);
  const providedSecret = normalizeText(
    c.req.header("x-sepay-api-key") ||
    c.req.header("x-api-key") ||
    c.req.header("authorization")?.replace(/^Bearer\s+/i, ""),
  );

  // Bắt buộc phải cấu hình secret. Nếu chưa cấu hình, từ chối để tránh webhook
  // giả mạo báo "đã thanh toán" khi chi nhánh chưa đặt secret.
  if (!expectedSecret) {
    await logWebhookEvent({
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

  if (providedSecret !== expectedSecret) {
    await logWebhookEvent({
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

  if (request.status === "paid") {
    await logWebhookEvent({
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: true,
      reason: "already_paid",
      payload: body,
    });
    return c.json({ success: true });
  }

  const now = new Date();
  if (request.status !== "pending" || now > request.expires_at) {
    if (request.status === "pending") {
      await db
        .update(schema.paymentRequests)
        .set({ status: "expired", updated_at: now })
        .where(eq(schema.paymentRequests.id, request.id));
    }
    await logWebhookEvent({
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: false,
      reason: "expired_or_cancelled",
      payload: body,
    });
    return c.json({ success: true });
  }

  const [order] = await db
    .select({
      total: schema.orders.total,
      status: schema.orders.status,
      table_session_id: schema.orders.table_session_id,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, request.order_id))
    .limit(1);

  let currentDue = 0;
  if (order?.table_session_id) {
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
    currentDue = sessionDueRows.reduce(
      (sum, row) => sum + Math.max(0, row.total - Number(row.total_paid || 0)),
      0,
    );
  } else if (order) {
    const [paid] = await db
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(and(eq(schema.payments.order_id, request.order_id), eq(schema.payments.status, "completed")));
    currentDue = Math.max(0, order.total - Number(paid?.total_paid || 0));
  }

  if (!order || order.status === "cancelled" || currentDue !== request.amount) {
    await db
      .update(schema.paymentRequests)
      .set({ status: "cancelled", cancelled_at: now, updated_at: now })
      .where(eq(schema.paymentRequests.id, request.id));
    await logWebhookEvent({
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: false,
      reason: "stale_order_amount",
      payload: body,
    });
    return c.json({ success: true });
  }

  if (amount < request.amount) {
    await db
      .update(schema.paymentRequests)
      .set({
        paid_amount: amount,
        provider_transaction_id: providerTransactionId || null,
        provider_payload: body,
        updated_at: now,
      })
      .where(eq(schema.paymentRequests.id, request.id));
    await logWebhookEvent({
      providerTransactionId,
      paymentRequestId: request.id,
      branchId: request.branch_id,
      amount,
      content,
      matched: false,
      reason: "underpaid",
      payload: body,
    });
    await wsManager.publish(`branch:${request.branch_id}`, {
      type: "payment:underpaid",
      payload: { paymentRequestId: request.id, orderId: request.order_id, amount, expectedAmount: request.amount },
      timestamp: Date.now(),
    });
    return c.json({ success: true });
  }

  const result = await db.transaction(async (tx) => {
    const completed = await completePaymentForOrder(tx, {
      orderId: request.order_id,
      organizationId: request.organization_id,
      branchId: request.branch_id,
      amount: request.amount,
      reference: paymentCode,
    });

    await tx
      .update(schema.paymentRequests)
      .set({
        status: "paid",
        paid_amount: amount,
        provider_transaction_id: providerTransactionId || null,
        provider_payload: body,
        paid_at: now,
        updated_at: now,
      })
      .where(eq(schema.paymentRequests.id, request.id));

    return completed;
  });

  // Sau khi tx commit: trừ kho + tích điểm cho các đơn vừa hoàn tất (idempotent, tự nuốt lỗi).
  await runCompletionSideEffects(result.completedOrders || [], request.organization_id, request.branch_id);

  await logWebhookEvent({
    providerTransactionId,
    paymentRequestId: request.id,
    branchId: request.branch_id,
    amount,
    content,
    matched: true,
    reason: amount > request.amount ? "overpaid" : "paid",
    payload: body,
  });

  await wsManager.publish(`branch:${request.branch_id}`, {
    type: "payment:confirmed",
    payload: {
      paymentRequestId: request.id,
      orderId: request.order_id,
      amount,
      expectedAmount: request.amount,
      fullyPaid: result.fullyPaid,
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

  return c.json({ success: true });
});

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

    const [active] = await db
      .select()
      .from(schema.paymentRequests)
      .where(
        and(
          eq(schema.paymentRequests.order_id, order.id),
          eq(schema.paymentRequests.branch_id, tenant.branchId),
          eq(schema.paymentRequests.status, "pending"),
          gt(schema.paymentRequests.expires_at, now),
        ),
      )
      .orderBy(desc(schema.paymentRequests.created_at))
      .limit(1);

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
    const transfer = buildTransferPayload(branch, paymentCode, amount);
    const expiresAt = new Date(now.getTime() + PAYMENT_REQUEST_TTL_MS);

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
