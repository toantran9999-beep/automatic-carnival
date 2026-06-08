import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  createTableSchema,
  updateTableStatusSchema,
  startSessionSchema,
  idParamSchema,
} from "@restai/validators";
import { z } from "zod";
import { TABLE_STATUS_TRANSITIONS } from "@restai/config";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { generateQrCode } from "../lib/id.js";
import { signCustomerToken } from "../lib/jwt.js";
import { wsManager } from "../ws/manager.js";
import * as sessionService from "../services/session.service.js";
import { t } from "../lib/i18n.js";

const tables = new Hono<AppEnv>();

tables.use("*", authMiddleware);
tables.use("*", tenantMiddleware);
tables.use("*", requireBranch);

// GET / - List tables for branch (optional spaceId filter)
tables.get("/", requirePermission("tables:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const spaceId = c.req.query("spaceId");

  const conditions = [
    eq(schema.tables.branch_id, tenant.branchId),
    eq(schema.tables.organization_id, tenant.organizationId),
  ];

  if (spaceId === "none") {
    conditions.push(isNull(schema.tables.space_id));
  } else if (spaceId) {
    conditions.push(eq(schema.tables.space_id, spaceId));
  }

  const tables = await db
    .select()
    .from(schema.tables)
    .where(and(...conditions))
    .orderBy(schema.tables.number);

  const [branch] = await db
    .select({ slug: schema.branches.slug })
    .from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId))
    .limit(1);

  // Get all active sessions for this branch
  const activeSessions = await db
    .select()
    .from(schema.tableSessions)
    .where(
      and(
        eq(schema.tableSessions.branch_id, tenant.branchId),
        eq(schema.tableSessions.status, "active"),
      ),
    );

  const sessionIds = activeSessions.map(s => s.id);
  
  let ordersList: any[] = [];
  let orderItemsList: any[] = [];
  
  if (sessionIds.length > 0) {
    ordersList = await db
      .select({
        id: schema.orders.id,
        table_session_id: schema.orders.table_session_id,
        total: schema.orders.total,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          inArray(schema.orders.table_session_id, sessionIds),
          sql`orders.status != 'cancelled'`
        ),
      );

    const orderIds = ordersList.map(o => o.id);
    if (orderIds.length > 0) {
      orderItemsList = await db
        .select({
          order_id: schema.orderItems.order_id,
          name: schema.orderItems.name,
          quantity: schema.orderItems.quantity,
        })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.order_id, orderIds));
    }
  }

  // Map orders to sessions
  const sessionOrdersMap = new Map<string, any[]>();
  for (const o of ordersList) {
    if (!sessionOrdersMap.has(o.table_session_id)) sessionOrdersMap.set(o.table_session_id, []);
    sessionOrdersMap.get(o.table_session_id)!.push(o);
  }

  // Map order items to orders
  const orderItemsMap = new Map<string, any[]>();
  for (const item of orderItemsList) {
    if (!orderItemsMap.has(item.order_id)) orderItemsMap.set(item.order_id, []);
    orderItemsMap.get(item.order_id)!.push(item);
  }

  // Map table sessions to tables
  const tableSessionMap = new Map<string, any>();
  for (const session of activeSessions) {
    const orders = sessionOrdersMap.get(session.id) || [];
    const total = orders.reduce((sum, o) => sum + o.total, 0);
    
    // Aggregate item summaries
    const itemsSummaryMap = new Map<string, number>();
    for (const o of orders) {
      const items = orderItemsMap.get(o.id) || [];
      for (const item of items) {
        itemsSummaryMap.set(item.name, (itemsSummaryMap.get(item.name) || 0) + item.quantity);
      }
    }
    const itemSummary = Array.from(itemsSummaryMap.entries())
      .map(([name, qty]) => `${qty}x ${name}`)
      .join(", ");

    tableSessionMap.set(session.table_id, {
      id: session.id,
      customerName: session.customer_name,
      startedAt: session.started_at,
      total,
      itemSummary,
    });
  }

  const result = tables.map((t) => ({
    ...t,
    activeSession: tableSessionMap.get(t.id) || null,
  }));

  return c.json({ success: true, data: { tables: result, branchSlug: branch?.slug || "" } });
});

// POST / - Create table
tables.post(
  "/",
  requirePermission("tables:create"),
  zValidator("json", createTableSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Get branch slug for QR code
    const [branch] = await db
      .select({ slug: schema.branches.slug })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);

    const qrCode = generateQrCode(branch?.slug || "branch", body.number);

    const [table] = await db
      .insert(schema.tables)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        space_id: body.spaceId || null,
        number: body.number,
        capacity: body.capacity,
        qr_code: qrCode,
      })
      .returning();

    return c.json({ success: true, data: table }, 201);
  },
);

// PATCH /:id - Update table
tables.patch(
  "/:id",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  zValidator("json", z.object({
    capacity: z.number().int().min(1).max(50).optional(),
    spaceId: z.string().uuid().nullable().optional(),
  })),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const updateData: Record<string, any> = {};
    if (body.capacity !== undefined) updateData.capacity = body.capacity;
    if (body.spaceId !== undefined) updateData.space_id = body.spaceId;

    const [updated] = await db
      .update(schema.tables)
      .set(updateData)
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// PATCH /:id/position - Update table position
tables.patch(
  "/:id/position",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  zValidator("json", z.object({ x: z.number(), y: z.number() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { x, y } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [updated] = await db
      .update(schema.tables)
      .set({ position_x: x, position_y: y })
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// DELETE /:id - Delete table
tables.delete(
  "/:id",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [deleted] = await db
      .delete(schema.tables)
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: deleted });
  },
);

// PATCH /:id/status - Update table status
tables.patch(
  "/:id/status",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateTableStatusSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Get current table
    const [table] = await db
      .select()
      .from(schema.tables)
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!table) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    // Validate status transition
    const allowed = TABLE_STATUS_TRANSITIONS[table.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: t(c, "invalid_status_transition", { from: table.status, to: status }),
          },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.tables)
      .set({ status })
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .returning();

    // Broadcast table status change
    await wsManager.publish(`branch:${tenant.branchId}`, {
      type: "table:status",
      payload: { tableId: updated.id, number: updated.number, status: updated.status },
      timestamp: Date.now(),
    });

    return c.json({ success: true, data: updated });
  },
);

// POST /sessions - Start a table session (customer QR flow)
tables.post(
  "/sessions",
  zValidator(
    "json",
    startSessionSchema.extend({ tableId: z.string().uuid() }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Get table
    const [table] = await db
      .select()
      .from(schema.tables)
      .where(
        and(
          eq(schema.tables.id, body.tableId),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!table) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    // Generate customer token
    const customerToken = await signCustomerToken({
      sub: crypto.randomUUID(),
      org: tenant.organizationId,
      branch: tenant.branchId,
      table: table.id,
    });

    const session = await sessionService.createSession({
      tableId: table.id,
      branchId: tenant.branchId,
      organizationId: tenant.organizationId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      token: customerToken,
    });

    // Set table to occupied
    await db
      .update(schema.tables)
      .set({ status: "occupied" })
      .where(eq(schema.tables.id, table.id));

    // Broadcast
    await wsManager.publish(`branch:${tenant.branchId}`, {
      type: "session:started",
      payload: { sessionId: session.id, tableNumber: table.number, customerName: body.customerName },
      timestamp: Date.now(),
    });

    return c.json({ success: true, data: { session, token: customerToken } }, 201);
  },
);

// GET /sessions - List sessions with optional status filter
tables.get("/sessions", requirePermission("tables:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const statusParam = c.req.query("status");

  const conditions = [
    eq(schema.tableSessions.branch_id, tenant.branchId),
    eq(schema.tableSessions.organization_id, tenant.organizationId),
  ];

  if (statusParam) {
    conditions.push(eq(schema.tableSessions.status, statusParam as any));
  }

  const sessions = await db
    .select({
      id: schema.tableSessions.id,
      table_id: schema.tableSessions.table_id,
      customer_name: schema.tableSessions.customer_name,
      customer_phone: schema.tableSessions.customer_phone,
      status: schema.tableSessions.status,
      started_at: schema.tableSessions.started_at,
      ended_at: schema.tableSessions.ended_at,
    })
    .from(schema.tableSessions)
    .where(and(...conditions))
    .orderBy(desc(schema.tableSessions.started_at))
    .limit(50);

  // Join with tables to get table numbers
  const tablesData = await db
    .select({ id: schema.tables.id, number: schema.tables.number })
    .from(schema.tables)
    .where(eq(schema.tables.branch_id, tenant.branchId));

  const tableMap = new Map(tablesData.map(t => [t.id, t.number]));

  const result = sessions.map(s => ({
    ...s,
    table_number: tableMap.get(s.table_id) ?? 0,
  }));

  return c.json({ success: true, data: result });
});

// GET /sessions/pending - List pending sessions for branch
tables.get("/sessions/pending", requirePermission("tables:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const sessions = await db
    .select({
      id: schema.tableSessions.id,
      customer_name: schema.tableSessions.customer_name,
      customer_phone: schema.tableSessions.customer_phone,
      started_at: schema.tableSessions.started_at,
      table_id: schema.tableSessions.table_id,
      table_number: schema.tables.number,
    })
    .from(schema.tableSessions)
    .innerJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
    .where(
      and(
        eq(schema.tableSessions.branch_id, tenant.branchId),
        eq(schema.tableSessions.status, "pending"),
      ),
    );

  return c.json({ success: true, data: sessions });
});

// GET /sessions/:id
tables.get(
  "/sessions/:id",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [session] = await db
      .select()
      .from(schema.tableSessions)
      .where(
        and(
          eq(schema.tableSessions.id, id),
          eq(schema.tableSessions.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "active_session_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: session });
  },
);

// PATCH /sessions/:id/approve - Approve pending session
tables.patch(
  "/sessions/:id/approve",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      const result = await sessionService.approveSession({
        sessionId: id,
        branchId: tenant.branchId,
      });

      // Broadcast approval
      await wsManager.publish(`branch:${tenant.branchId}`, {
        type: "session:approved",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });
      await wsManager.publish(`session:${id}`, {
        type: "session:approved",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });

      return c.json({ success: true, data: result.session });
    } catch (e: any) {
      if (e.message === "PENDING_SESSION_NOT_FOUND") {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "pending_session_not_found") } },
          404,
        );
      }
      throw e;
    }
  },
);

// PATCH /sessions/:id/reject - Reject pending session
tables.patch(
  "/sessions/:id/reject",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      const result = await sessionService.rejectSession({
        sessionId: id,
        branchId: tenant.branchId,
      });

      // Broadcast rejection
      await wsManager.publish(`branch:${tenant.branchId}`, {
        type: "session:rejected",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });
      await wsManager.publish(`session:${id}`, {
        type: "session:rejected",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });

      return c.json({ success: true, data: result.session });
    } catch (e: any) {
      if (e.message === "PENDING_SESSION_NOT_FOUND") {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "pending_session_not_found") } },
          404,
        );
      }
      throw e;
    }
  },
);

// PATCH /sessions/:id/end - End an active session
tables.patch(
  "/sessions/:id/end",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      const result = await sessionService.endSession({
        sessionId: id,
        branchId: tenant.branchId,
      });

      // Broadcast session ended
      await wsManager.publish(`branch:${tenant.branchId}`, {
        type: "session:ended",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });

      return c.json({ success: true, data: result.session });
    } catch (e: any) {
      if (e.message === "ACTIVE_SESSION_NOT_FOUND") {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "active_session_not_found") } },
          404,
        );
      }
      throw e;
    }
  },
);

// GET /:id/active-session - Get active session for table with orders and items
tables.get(
  "/:id/active-session",
  requirePermission("tables:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [session] = await db
      .select({
        id: schema.tableSessions.id,
        table_id: schema.tableSessions.table_id,
        customer_name: schema.tableSessions.customer_name,
        customer_phone: schema.tableSessions.customer_phone,
        status: schema.tableSessions.status,
        started_at: schema.tableSessions.started_at,
      })
      .from(schema.tableSessions)
      .where(
        and(
          eq(schema.tableSessions.table_id, id),
          eq(schema.tableSessions.status, "active"),
          eq(schema.tableSessions.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json({ success: true, data: null });
    }

    // Fetch orders for this active session
    const orders = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        total: schema.orders.total,
        status: schema.orders.status,
        created_at: schema.orders.created_at,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.table_session_id, session.id),
          eq(schema.orders.branch_id, tenant.branchId),
          sql`orders.status != 'cancelled'`
        ),
      );

    // Fetch order items for each order
    const orderIds = orders.map(o => o.id);
    let items: any[] = [];
    if (orderIds.length > 0) {
      items = await db
        .select({
          id: schema.orderItems.id,
          order_id: schema.orderItems.order_id,
          menu_item_id: schema.orderItems.menu_item_id,
          name: schema.orderItems.name,
          unit_price: schema.orderItems.unit_price,
          quantity: schema.orderItems.quantity,
          notes: schema.orderItems.notes,
        })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.order_id, orderIds));

      // Fetch modifier options for each order item
      const itemIds = items.map(it => it.id);
      if (itemIds.length > 0) {
        const modifiers = await db
          .select({
            order_item_id: schema.orderItemModifiers.order_item_id,
            modifier_id: schema.orderItemModifiers.modifier_id,
            name: schema.modifiers.name,
            price: schema.modifiers.price,
          })
          .from(schema.orderItemModifiers)
          .innerJoin(schema.modifiers, eq(schema.orderItemModifiers.modifier_id, schema.modifiers.id))
          .where(inArray(schema.orderItemModifiers.order_item_id, itemIds));

        // Group modifiers by order_item_id
        const modMap = new Map<string, any[]>();
        for (const mod of modifiers) {
          if (!modMap.has(mod.order_item_id)) modMap.set(mod.order_item_id, []);
          modMap.get(mod.order_item_id)!.push({
            modifierId: mod.modifier_id,
            name: mod.name,
            price: mod.price,
          });
        }

        // Map modifiers back to items
        for (const item of items) {
          item.modifiers = modMap.get(item.id) || [];
        }
      }
    }

    // Attach items to orders
    const itemsByOrderId = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByOrderId.has(item.order_id)) itemsByOrderId.set(item.order_id, []);
      itemsByOrderId.get(item.order_id)!.push(item);
    }

    const ordersWithItems = orders.map(o => ({
      ...o,
      items: itemsByOrderId.get(o.id) || [],
    }));

    return c.json({
      success: true,
      data: {
        session,
        orders: ordersWithItems,
      },
    });
  },
);

// GET /:id/history - Table history with sessions and orders
tables.get(
  "/:id/history",
  requirePermission("tables:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;
    const from = c.req.query("from");
    const to = c.req.query("to");

    try {
      const data = await sessionService.getTableHistory({
        tableId: id,
        branchId: tenant.branchId,
        from: from || undefined,
        to: to || undefined,
      });

      return c.json({ success: true, data });
    } catch (e: any) {
      if (e.message === "TABLE_NOT_FOUND") {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
          404,
        );
      }
      throw e;
    }
  },
);

// GET /my-assignments - List tables assigned to the current user
tables.get("/my-assignments", requirePermission("tables:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const user = c.get("user") as any;

  const assignments = await db
    .select({
      table_id: schema.tableAssignments.table_id,
      table_number: schema.tables.number,
    })
    .from(schema.tableAssignments)
    .innerJoin(schema.tables, eq(schema.tableAssignments.table_id, schema.tables.id))
    .where(
      and(
        eq(schema.tableAssignments.user_id, user.sub),
        eq(schema.tableAssignments.branch_id, tenant.branchId),
      ),
    );

  return c.json({ success: true, data: assignments });
});

// GET /:id/assignments - List assigned waiters for a table
tables.get(
  "/:id/assignments",
  requirePermission("tables:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const assignments = await db
      .select({
        id: schema.tableAssignments.id,
        table_id: schema.tableAssignments.table_id,
        user_id: schema.tableAssignments.user_id,
        created_at: schema.tableAssignments.created_at,
        user_name: schema.users.name,
        user_role: schema.users.role,
      })
      .from(schema.tableAssignments)
      .innerJoin(schema.users, eq(schema.tableAssignments.user_id, schema.users.id))
      .where(
        and(
          eq(schema.tableAssignments.table_id, id),
          eq(schema.tableAssignments.branch_id, tenant.branchId),
        ),
      );

    return c.json({ success: true, data: assignments });
  },
);

// POST /:id/assignments - Assign waiter to table
tables.post(
  "/:id/assignments",
  requirePermission("tables:update"),
  zValidator("param", idParamSchema),
  zValidator("json", z.object({ userId: z.string().uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { userId } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Check table exists
    const [table] = await db
      .select()
      .from(schema.tables)
      .where(
        and(
          eq(schema.tables.id, id),
          eq(schema.tables.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!table) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "table_not_found") } },
        404,
      );
    }

    const [targetUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(
        schema.userBranches,
        eq(schema.users.id, schema.userBranches.user_id),
      )
      .where(
        and(
          eq(schema.users.id, userId),
          eq(schema.users.organization_id, tenant.organizationId),
          eq(schema.userBranches.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!targetUser) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: t(c, "user_not_org") },
        },
        400,
      );
    }

    // Check if already assigned
    const [existing] = await db
      .select()
      .from(schema.tableAssignments)
      .where(
        and(
          eq(schema.tableAssignments.table_id, id),
          eq(schema.tableAssignments.user_id, userId),
        ),
      )
      .limit(1);

    if (existing) {
      return c.json(
        { success: false, error: { code: "CONFLICT", message: t(c, "user_already_table") } },
        409,
      );
    }

    const [assignment] = await db
      .insert(schema.tableAssignments)
      .values({
        table_id: id,
        user_id: userId,
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
      })
      .returning();

    return c.json({ success: true, data: assignment }, 201);
  },
);

// DELETE /:id/assignments/:userId - Remove assignment
tables.delete(
  "/:id/assignments/:userId",
  requirePermission("tables:update"),
  async (c) => {
    const id = c.req.param("id");
    const userId = c.req.param("userId");
    const tenant = c.get("tenant") as any;

    const [deleted] = await db
      .delete(schema.tableAssignments)
      .where(
        and(
          eq(schema.tableAssignments.table_id, id),
          eq(schema.tableAssignments.user_id, userId),
          eq(schema.tableAssignments.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "assignment_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: deleted });
  },
);

export { tables };
