import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql, inArray, getTableColumns } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updateOrderItemStatusSchema,
  idParamSchema,
  orderQuerySchema,
} from "@restai/validators";
import { ORDER_STATUS_TRANSITIONS, ORDER_ITEM_STATUS_TRANSITIONS } from "@restai/config";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";
import { z } from "zod";
import { createOrder, handleOrderCompletion, OrderValidationError } from "../services/order.service.js";
import { signCustomerToken } from "../lib/jwt.js";

const orders = new Hono<AppEnv>();

orders.use("*", authMiddleware);
orders.use("*", tenantMiddleware);
orders.use("*", requireBranch);

// GET / - List orders
orders.get("/", requirePermission("orders:read"), zValidator("query", orderQuerySchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const { status, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.orders.branch_id, tenant.branchId),
    eq(schema.orders.organization_id, tenant.organizationId),
  ];

  if (status) {
    conditions.push(eq(schema.orders.status, status as any));
  }

  const whereClause = and(...conditions);

  const [result, countResult] = await Promise.all([
    db
      .select({
        ...getTableColumns(schema.orders),
        item_count: sql<number>`(SELECT COUNT(*)::int FROM order_items WHERE order_items.order_id = ${schema.orders.id})`,
        total_paid: sql<number>`COALESCE((SELECT SUM(amount)::int FROM payments WHERE payments.order_id = ${schema.orders.id} AND payments.status = 'completed'), 0)`,
        table_number: schema.tables.number,
      })
      .from(schema.orders)
      .leftJoin(schema.tableSessions, eq(schema.orders.table_session_id, schema.tableSessions.id))
      .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
      .where(whereClause)
      .orderBy(desc(schema.orders.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.orders)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const enriched = result.map((order) => {
    const paid = order.total_paid ?? 0;
    const orderTotal = order.total ?? 0;
    const paymentStatus = paid >= orderTotal && orderTotal > 0
      ? "paid"
      : paid > 0
        ? "partial"
        : "unpaid";
    return { ...order, payment_status: paymentStatus };
  });

  return c.json({
    success: true,
    data: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST / - Create order
orders.post(
  "/",
  requirePermission("orders:create"),
  zValidator("json", createOrderSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    // Phải có ca đang mở mới được tạo đơn (mở ca mới xài được chức năng).
    const [openShift] = await db
      .select({ id: schema.registerShifts.id })
      .from(schema.registerShifts)
      .where(
        and(
          eq(schema.registerShifts.branch_id, tenant.branchId),
          eq(schema.registerShifts.status, "open"),
        ),
      )
      .limit(1);
    if (!openShift) {
      return c.json(
        { success: false, error: { code: "NO_OPEN_SHIFT", message: "Chưa mở ca làm việc. Vui lòng mở ca trước khi bán hàng." } },
        409,
      );
    }

    // Determine table_session_id
    let tableSessionId: string | null = body.tableSessionId || null;
    if (user.role === "customer") {
      const [session] = await db
        .select({ id: schema.tableSessions.id })
        .from(schema.tableSessions)
        .where(
          and(
            eq(schema.tableSessions.table_id, user.table),
            eq(schema.tableSessions.status, "active"),
          ),
        )
        .limit(1);
      tableSessionId = session?.id || null;
    } else if (body.tableId && !tableSessionId) {
      // Find table first to get its number
      const [table] = await db
        .select({ number: schema.tables.number })
        .from(schema.tables)
        .where(
          and(
            eq(schema.tables.id, body.tableId),
            eq(schema.tables.branch_id, tenant.branchId),
          ),
        )
        .limit(1);

      if (table) {
        const [session] = await db
          .select({ id: schema.tableSessions.id })
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.table_id, body.tableId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);
        if (session) {
          tableSessionId = session.id;
        } else {
          const customerToken = await signCustomerToken({
            sub: crypto.randomUUID(),
            org: tenant.organizationId,
            branch: tenant.branchId,
            table: body.tableId,
          });

          const [newSession] = await db
            .insert(schema.tableSessions)
            .values({
              organization_id: tenant.organizationId,
              branch_id: tenant.branchId,
              table_id: body.tableId,
              status: "active",
              customer_name: body.customerName || "POS Staff",
              token: customerToken,
            })
            .returning();

          tableSessionId = newSession.id;
        }

        // Always ensure table is marked occupied and broadcast
        await db
          .update(schema.tables)
          .set({ status: "occupied" })
          .where(eq(schema.tables.id, body.tableId));

        await wsManager.publish(`branch:${tenant.branchId}`, {
          type: "table:status",
          payload: { tableId: body.tableId, number: table.number, status: "occupied" },
          timestamp: Date.now(),
        });
      }
    }

    let result;
    try {
      result = await createOrder({
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        items: body.items,
        type: body.type,
        customerName: body.customerName,
        notes: body.notes,
        tableSessionId,
      });
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: err.message } },
          400,
        );
      }
      throw err;
    }

    const { order, items: createdItems } = result;

    // Enrich the broadcast so the counter print-station can auto-print a full
    // kitchen ticket from the WS event alone (no extra fetch needed):
    //  - table number (from the session, if any)
    //  - modifier names per item (e.g. "Cà phê đá (nhẹ, ít đường)")
    let ticketTableNumber: number | null = null;
    if (order.table_session_id) {
      const [tbl] = await db
        .select({ number: schema.tables.number })
        .from(schema.tableSessions)
        .innerJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
        .where(eq(schema.tableSessions.id, order.table_session_id))
        .limit(1);
      ticketTableNumber = tbl?.number ?? null;
    }

    const createdItemIds = createdItems.map((i) => i.id);
    const itemModifiers = createdItemIds.length
      ? await db
          .select({
            order_item_id: schema.orderItemModifiers.order_item_id,
            name: schema.orderItemModifiers.name,
          })
          .from(schema.orderItemModifiers)
          .where(inArray(schema.orderItemModifiers.order_item_id, createdItemIds))
      : [];
    const modsByItem = new Map<string, string[]>();
    for (const m of itemModifiers) {
      const arr = modsByItem.get(m.order_item_id) ?? [];
      arr.push(m.name);
      modsByItem.set(m.order_item_id, arr);
    }

    // Broadcast new order to branch and kitchen
    const orderPayload = {
      type: "order:new",
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        tableNumber: ticketTableNumber,
        customerName: order.customer_name,
        createdAt: order.created_at,
        orderType: order.type,
        items: createdItems.map((i) => {
          const mods = modsByItem.get(i.id) ?? [];
          return {
            id: i.id,
            name: mods.length ? `${i.name} (${mods.join(", ")})` : i.name,
            quantity: i.quantity,
            status: i.status,
            notes: i.notes,
            unit: i.unit ?? null,
          };
        }),
      },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, orderPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, orderPayload);

    return c.json({ success: true, data: { ...order, items: createdItems } }, 201);
  },
);

// GET /:id - Get order with items
orders.get(
  "/:id",
  requirePermission("orders:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
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

    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, order.id));

    return c.json({ success: true, data: { ...order, items } });
  },
);

// PATCH /:id/status
orders.patch(
  "/:id/status",
  requirePermission("orders:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateOrderStatusSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
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

    const allowed = ORDER_STATUS_TRANSITIONS[order.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: t(c, "invalid_status_transition", { from: order.status, to: status }),
          },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.orders)
      .set({ status, updated_at: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();

    const updatePayload = {
      type: "order:updated",
      payload: { orderId: updated.id, orderNumber: updated.order_number, status: updated.status },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, updatePayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, updatePayload);

    // If order has a session, notify the customer too
    if (order.table_session_id) {
      await wsManager.publish(`session:${order.table_session_id}`, updatePayload);
    }

    // Handle side effects when order is completed (loyalty points + inventory deduction)
    if (status === "completed") {
      await handleOrderCompletion({
        orderId: order.id,
        orderNumber: order.order_number,
        orderTotal: order.total,
        customerId: order.customer_id,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        inventoryDeducted: order.inventory_deducted,
      });
    }

    return c.json({ success: true, data: updated });
  },
);

// PATCH /:id/items/:itemId/status
orders.patch(
  "/:id/items/:itemId/status",
  requirePermission("orders:update"),
  zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
  zValidator("json", updateOrderItemStatusSchema),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Verify order belongs to branch
    const [order] = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        table_session_id: schema.orders.table_session_id,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
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

    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.id, itemId),
          eq(schema.orderItems.order_id, id),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    const allowed = ORDER_ITEM_STATUS_TRANSITIONS[item.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: t(c, "invalid_status_transition", { from: item.status, to: status }),
          },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.orderItems)
      .set({ status })
      .where(eq(schema.orderItems.id, itemId))
      .returning();

    const itemPayload = {
      type: "order:item_status",
      payload: {
        orderId: id,
        orderNumber: order.order_number,
        item: { id: updated.id, name: updated.name, quantity: updated.quantity, status: updated.status },
      },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, itemPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, itemPayload);
    if (order.table_session_id) {
      await wsManager.publish(`session:${order.table_session_id}`, itemPayload);
    }

    return c.json({ success: true, data: updated });
  },
);

export { orders };
