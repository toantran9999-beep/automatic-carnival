import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, gte, lte, sql, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { createPaymentSchema, idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { peruStartOfDay, peruEndOfDay } from "../lib/timezone.js";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";

const payments = new Hono<AppEnv>();

payments.use("*", authMiddleware);
payments.use("*", tenantMiddleware);
payments.use("*", requireBranch);

// GET /summary - Daily payment summary (must be before /:id)
payments.get("/summary", requirePermission("payments:read"), async (c) => {
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
