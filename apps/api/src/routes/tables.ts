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
import { requirePermission, blockLiveOps } from "../middleware/rbac.js";
import { generateOrderNumber, generateQrCode } from "../lib/id.js";
import { signCustomerToken } from "../lib/jwt.js";
import { wsManager } from "../ws/manager.js";
import * as sessionService from "../services/session.service.js";
import { loadItemModifiers } from "../services/order.service.js";
import { t } from "../lib/i18n.js";

const tables = new Hono<AppEnv>();

tables.use("*", authMiddleware);
tables.use("*", tenantMiddleware);
tables.use("*", requireBranch);

const tableTransferSchema = z.object({
  targetTableId: z.string().uuid(),
});

const tableMergeSchema = z.object({
  targetSessionId: z.string().uuid(),
  sourceSessionIds: z.array(z.string().uuid()).min(1).max(10),
});

const tableSplitSchema = z.object({
  targetTableId: z.string().uuid(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
});

function centsTax(total: number, taxRate: number) {
  return Math.round(total - total / (1 + taxRate / 10000));
}

async function publishTableLayoutChanged(
  branchId: string,
  payload: Record<string, unknown>,
) {
  await wsManager.publish(`branch:${branchId}`, {
    type: "table:layout_changed",
    payload,
    timestamp: Date.now(),
  });
}

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

  // ?layout=1 — CHỈ sơ đồ phân bổ (màn sắp xếp bàn của quản lý).
  // ⚠️ Thoát ra ở ĐÂY, trước khi truy vấn phiên bàn/đơn/món: tên khách và số tiền
  // KHÔNG ĐƯỢC rời khỏi máy chủ cho màn này. Lọc ở giao diện là vô nghĩa — dữ liệu
  // vẫn nằm trong bộ nhớ trình duyệt và vẫn xem được bằng công cụ nhà phát triển.
  // Tiện thể đỡ 3 truy vấn nặng cho một màn không cần tới chúng.
  if (c.req.query("layout") === "1") {
    return c.json({
      success: true,
      data: {
        // ⚠️ CHỌN ĐÍCH DANH từng trường, KHÔNG dùng `...t` rồi xoá bớt. Bảng
        // `tables` có cột `status` (available/occupied) — để lọt là vẫn nói được
        // bàn nào đang có khách, dù đã giấu tên khách và số tiền. Chọn đích danh
        // thì cột mới thêm vào bảng sau này cũng không tự lọt ra.
        tables: tables.map((t) => ({
          id: t.id,
          number: t.number,
          capacity: t.capacity,
          space_id: t.space_id,
          position_x: t.position_x,
          position_y: t.position_y,
        })),
        branchSlug: branch?.slug || "",
      },
    });
  }

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

  // ?withItems=1 — chi tiết từng đơn & từng món (hộp thoại "Bàn đang có khách" ở
  // Tổng quan). Mặc định KHÔNG bật.
  //
  // ⚠️ Đường mặc định chỉ trả `itemSummary` — một chuỗi gộp theo TÊN món, nên hai ly
  // cùng tên khác tùy chọn bị nhập thành một dòng. Muốn hiện dòng phụ thì phải lấy
  // thêm cột, mà đường mặc định là truy vấn SỐNG (trang Bàn ăn gọi lại mỗi 20 giây)
  // — nhồi vào đó là mỗi lượt kéo thêm một mớ chẳng ai xem. Vì vậy tách cờ riêng,
  // cùng lối `?layout=1` ở trên.
  const withItems = c.req.query("withItems") === "1";

  let ordersList: any[] = [];
  let orderItemsList: any[] = [];

  if (sessionIds.length > 0) {
    ordersList = await db
      .select({
        id: schema.orders.id,
        table_session_id: schema.orders.table_session_id,
        total: schema.orders.total,
        // Luôn lấy: cần để biết đơn đã đủ cũ để coi là "chưa in" hay chưa.
        created_at: schema.orders.created_at,
        ...(withItems
          ? {
              order_number: schema.orders.order_number,
              created_by_name: schema.users.name,
            }
          : {}),
      })
      .from(schema.orders)
      // leftJoin: đơn cũ và đơn khách tự gọi không có người bấm — phải ra null chứ
      // không được làm mất dòng đơn (mất đơn là mất tiền khỏi tổng của bàn).
      .leftJoin(schema.users, eq(schema.orders.created_by, schema.users.id))
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          inArray(schema.orders.table_session_id, sessionIds),
          sql`orders.status != 'cancelled'`
        ),
      )
      .orderBy(schema.orders.created_at);

    const orderIds = ordersList.map(o => o.id);
    if (orderIds.length > 0) {
      orderItemsList = await db
        .select({
          order_id: schema.orderItems.order_id,
          name: schema.orderItems.name,
          quantity: schema.orderItems.quantity,
          ...(withItems
            ? {
                id: schema.orderItems.id,
                unit_price: schema.orderItems.unit_price,
                total: schema.orderItems.total,
                unit: schema.orderItems.unit,
                notes: schema.orderItems.notes,
                created_at: schema.orderItems.created_at,
                created_by_name: schema.users.name,
              }
            : {}),
        })
        .from(schema.orderItems)
        .leftJoin(schema.users, eq(schema.orderItems.created_by, schema.users.id))
        .where(inArray(schema.orderItems.order_id, orderIds))
        .orderBy(schema.orderItems.created_at);
    }
  }

  /**
   * Phiếu đặt món của bàn này đã ra giấy chưa.
   *
   * ⚠️ Không có dòng trong `order_prints` = CHƯA IN. Trước khi có sổ này thì mất
   * phiếu là chuyện chỉ biết khi khách hỏi nước đâu — sáng 03/09/2026 mất cả hai
   * kiểu (mất hẳn đơn, và đơn nhiều ly ra thiếu tờ) mà không truy được đơn nào.
   *
   * Chờ 45 giây rồi mới kêu: đơn vừa bấm xong thì phiếu còn đang chạy ra khỏi
   * máy in, kêu ngay là kêu oan cả ngày rồi không ai thèm nhìn nữa.
   */
  const orderIdsAll = ordersList.map((o) => o.id);
  const printRows = orderIdsAll.length
    ? await db
        .select({
          order_id: schema.orderPrints.order_id,
          status: schema.orderPrints.status,
        })
        .from(schema.orderPrints)
        .where(
          and(
            inArray(schema.orderPrints.order_id, orderIdsAll),
            eq(schema.orderPrints.kind, "kitchen"),
            eq(schema.orderPrints.add_on_id, ""),
          ),
        )
    : [];
  const printByOrder = new Map(printRows.map((r) => [r.order_id, r.status]));

  // Một truy vấn cho tùy chọn của TOÀN BỘ món của mọi bàn — không N+1 theo bàn.
  const modsByItem = withItems
    ? await loadItemModifiers(orderItemsList.map((i) => i.id))
    : new Map();

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

    // Chỉ soi đơn trong khoảng 45 giây tới 20 phút:
    //  - dưới 45 giây: phiếu còn đang chạy ra khỏi máy in, kêu là kêu oan;
    //  - trên 20 phút: hoặc đã phục vụ xong, hoặc là đơn có TRƯỚC khi có sổ này
    //    (sổ trống không có nghĩa là chưa in) — treo huy hiệu đỏ cả ngày thì
    //    hôm sau không ai thèm nhìn nó nữa.
    const printNewest = Date.now() - 45_000;
    const printOldest = Date.now() - 20 * 60_000;
    let printIssue: "none" | "missing" | "partial" = "none";
    for (const o of orders) {
      const at = new Date(o.created_at).getTime();
      if (at > printNewest || at < printOldest) continue;
      const st = printByOrder.get(o.id);
      if (!st) { printIssue = "missing"; break; }
      if (st !== "ok") printIssue = "partial";
    }

    tableSessionMap.set(session.table_id, {
      id: session.id,
      customerName: session.customer_name,
      startedAt: session.started_at,
      total,
      itemSummary,
      /** 'missing' = chưa có phiếu nào ra giấy · 'partial' = ra thiếu tờ */
      printIssue,
      ...(withItems
        ? {
            orders: orders.map((o) => ({
              id: o.id,
              orderNumber: o.order_number,
              createdAt: o.created_at,
              createdByName: o.created_by_name ?? null,
              total: o.total,
              items: (orderItemsMap.get(o.id) || []).map((i) => ({
                id: i.id,
                name: i.name,
                quantity: i.quantity,
                // Quy ước tiền của repo: unit_price CHƯA gồm tùy chọn, total ĐÃ gồm.
                unit_price: i.unit_price,
                total: i.total,
                unit: i.unit ?? undefined,
                notes: i.notes ?? undefined,
                createdAt: i.created_at,
                createdByName: i.created_by_name ?? null,
                modifiers: modsByItem.get(i.id) ?? [],
              })),
            })),
          }
        : {}),
    });
  }

  const result = tables.map((t) => ({
    ...t,
    activeSession: tableSessionMap.get(t.id) || null,
  }));

  return c.json({ success: true, data: { tables: result, branchSlug: branch?.slug || "" } });
});

// GET /takeaway - Đơn mang về đang mở (chưa thanh toán/hủy)
tables.get("/takeaway", requirePermission("orders:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const orders = await db
    .select({
      id: schema.orders.id,
      order_number: schema.orders.order_number,
      customer_name: schema.orders.customer_name,
      total: schema.orders.total,
      tax: schema.orders.tax,
      created_at: schema.orders.created_at,
      created_by_name: schema.users.name,
    })
    .from(schema.orders)
    // leftJoin: đơn cũ (trước 30/07/2026) không có người bấm — phải ra null chứ
    // không được làm mất dòng đơn.
    .leftJoin(schema.users, eq(schema.orders.created_by, schema.users.id))
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        eq(schema.orders.type, "takeout"),
        sql`orders.status NOT IN ('completed','cancelled')`,
      ),
    )
    // Mới nhất lên đầu: thu ngân vừa tạo đơn là thấy ngay ở đầu danh sách.
    .orderBy(desc(schema.orders.created_at));

  if (orders.length === 0) return c.json({ success: true, data: [] });

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select({
      order_id: schema.orderItems.order_id,
      id: schema.orderItems.id,
      menu_item_id: schema.orderItems.menu_item_id,
      name: schema.orderItems.name,
      unit_price: schema.orderItems.unit_price,
      quantity: schema.orderItems.quantity,
      total: schema.orderItems.total,
      notes: schema.orderItems.notes,
      unit: schema.orderItems.unit,
      created_at: schema.orderItems.created_at,
      created_by_name: schema.users.name,
    })
    .from(schema.orderItems)
    .leftJoin(schema.users, eq(schema.orderItems.created_by, schema.users.id))
    .where(inArray(schema.orderItems.order_id, orderIds))
    // Theo giờ thêm: món gọi thêm nằm dưới, đọc ra đúng thứ tự khách gọi.
    .orderBy(schema.orderItems.created_at);

  // ⚠️ Chỗ này TỪNG ghi cứng `modifiers: []` — đơn mang về ra tới máy tính tiền là
  // mất sạch tùy chọn, nên phiếu in dòng món theo `unit_price` (giá gốc 20.000đ)
  // trong khi tổng lấy từ đơn (18.000đ). Một tờ giấy hai con số vênh nhau.
  const modsByItem = await loadItemModifiers(items.map((i) => i.id));

  const byOrder = new Map<string, typeof items>();
  for (const it of items) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id)!.push(it);
  }

  const data = orders.map((o) => {
    const its = byOrder.get(o.id) || [];
    return {
      ...o,
      itemSummary: its.map((i) => `${i.quantity}x ${i.name}`).join(", "),
      items: its.map((i) => ({
        id: i.id,
        menuItemId: i.menu_item_id,
        name: i.name,
        unitPrice: i.unit_price,
        quantity: i.quantity,
        total: i.total,
        unit: i.unit ?? undefined,
        notes: i.notes ?? undefined,
        createdAt: i.created_at,
        createdByName: i.created_by_name ?? null,
        modifiers: modsByItem.get(i.id) ?? [],
      })),
    };
  });
  return c.json({ success: true, data });
});

// PATCH /takeaway/:id/void - Huỷ đơn mang về (có ghi log)
tables.patch(
  "/takeaway/:id/void",
  requirePermission("orders:update"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    const [order] = await db
      .select({ id: schema.orders.id, status: schema.orders.status, total: schema.orders.total })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.branch_id, tenant.branchId),
          eq(schema.orders.type, "takeout"),
        ),
      )
      .limit(1);
    if (!order) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Không tìm thấy đơn mang về" } }, 404);
    }
    if (order.status === "completed" || order.status === "cancelled") {
      return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Đơn đã đóng" } }, 400);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.orders)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(eq(schema.orders.id, id));
      await tx.insert(schema.tableSessionEvents).values({
        organization_id: tenant.organizationId,
        branch_id: tenant.branchId,
        actor_user_id: user?.sub ?? null,
        action: "void",
        metadata: { takeaway: true, orderId: id, total: order.total },
      });
    });

    await publishTableLayoutChanged(tenant.branchId, { action: "takeaway_void", orderId: id });
    return c.json({ success: true, data: { id } });
  },
);

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

    // ⚠️ Chặn xoá bàn ĐANG CÓ KHÁCH — xoá là mất luôn đơn của khách đang ngồi.
    // Phải kiểm Ở ĐÂY chứ không phải ở giao diện: màn Cài đặt → Sơ đồ bàn CỐ Ý
    // không biết bàn nào đang có khách (không tải dữ liệu đó về máy), nên nó
    // không thể tự tránh được.
    const [activeSession] = await db
      .select({ id: schema.tableSessions.id })
      .from(schema.tableSessions)
      .where(
        and(
          eq(schema.tableSessions.table_id, id),
          eq(schema.tableSessions.status, "active"),
        ),
      )
      .limit(1);

    if (activeSession) {
      return c.json(
        {
          success: false,
          error: {
            code: "TABLE_IN_USE",
            message: t(c, "table_in_use_cannot_delete"),
          },
        },
        409,
      );
    }

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
// ⚠️ Đây là DỮ LIỆU ĐANG CHẢY nên có `blockLiveOps`, khác hẳn `PATCH /:id` (đổi tên,
// sức chứa — việc setup, quản lý vẫn làm được) dù cả hai dùng chung `tables:update`.
tables.patch(
  "/:id/status",
  requirePermission("tables:update"),
  blockLiveOps,
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
  blockLiveOps,
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
  blockLiveOps,
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
  blockLiveOps,
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
  blockLiveOps,
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

// PATCH /sessions/:id/void - Huỷ đơn chưa thanh toán + đóng phiên + giải phóng bàn (có ghi log)
// Khác /end: /end để đơn lửng; /void huỷ hẳn đơn chưa TT và lưu vết vào table_session_events.
tables.patch(
  "/sessions/:id/void",
  requirePermission("tables:update"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    try {
      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.id, id),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);
        if (!session) throw new Error("ACTIVE_SESSION_NOT_FOUND");

        const openOrders = await tx
          .select({ id: schema.orders.id, total: schema.orders.total })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.table_session_id, id),
              eq(schema.orders.branch_id, tenant.branchId),
              sql`orders.status NOT IN ('completed', 'cancelled')`,
            ),
          );
        const cancelledTotal = openOrders.reduce((s, o) => s + o.total, 0);

        if (openOrders.length > 0) {
          await tx
            .update(schema.orders)
            .set({ status: "cancelled", updated_at: new Date() })
            .where(
              and(
                eq(schema.orders.table_session_id, id),
                sql`orders.status NOT IN ('completed', 'cancelled')`,
              ),
            );
        }

        await tx
          .update(schema.tableSessions)
          .set({ status: "completed", ended_at: new Date() })
          .where(eq(schema.tableSessions.id, id));

        await tx
          .update(schema.tables)
          .set({ status: "available" })
          .where(eq(schema.tables.id, session.table_id));

        await tx.insert(schema.tableSessionEvents).values({
          organization_id: tenant.organizationId,
          branch_id: tenant.branchId,
          actor_user_id: user?.sub ?? null,
          action: "void",
          source_session_id: id,
          source_table_id: session.table_id,
          metadata: { cancelledOrders: openOrders.length, cancelledTotal },
        });

        return {
          tableId: session.table_id,
          sessionId: id,
          cancelledOrders: openOrders.length,
          cancelledTotal,
        };
      });

      await wsManager.publish(`branch:${tenant.branchId}`, {
        type: "session:ended",
        payload: { sessionId: id, tableId: result.tableId },
        timestamp: Date.now(),
      });
      await publishTableLayoutChanged(tenant.branchId, { action: "void", ...result });

      return c.json({ success: true, data: result });
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

// POST /sessions/:id/transfer - Move an active table session to an empty table
tables.post(
  "/sessions/:id/transfer",
  requirePermission("tables:update"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  zValidator("json", tableTransferSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { targetTableId } = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    try {
      const result = await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.id, id),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);

        if (!session) throw new Error("ACTIVE_SESSION_NOT_FOUND");
        if (session.table_id === targetTableId) throw new Error("SAME_TABLE");

        const [targetTable] = await tx
          .select()
          .from(schema.tables)
          .where(
            and(
              eq(schema.tables.id, targetTableId),
              eq(schema.tables.branch_id, tenant.branchId),
              eq(schema.tables.organization_id, tenant.organizationId),
            ),
          )
          .limit(1);
        if (!targetTable) throw new Error("TARGET_TABLE_NOT_FOUND");

        const [targetActive] = await tx
          .select({ id: schema.tableSessions.id })
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.table_id, targetTableId),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);
        if (targetActive) throw new Error("TARGET_TABLE_OCCUPIED");

        const [completedOrder] = await tx
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.table_session_id, id),
              eq(schema.orders.branch_id, tenant.branchId),
              eq(schema.orders.status, "completed"),
            ),
          )
          .limit(1);
        if (completedOrder) throw new Error("COMPLETED_ORDER_LOCKED");

        const [updatedSession] = await tx
          .update(schema.tableSessions)
          .set({ table_id: targetTableId })
          .where(eq(schema.tableSessions.id, id))
          .returning();

        await tx
          .update(schema.tables)
          .set({ status: "available" })
          .where(eq(schema.tables.id, session.table_id));
        await tx
          .update(schema.tables)
          .set({ status: "occupied" })
          .where(eq(schema.tables.id, targetTableId));

        await tx.insert(schema.tableSessionEvents).values({
          organization_id: tenant.organizationId,
          branch_id: tenant.branchId,
          actor_user_id: user.sub,
          action: "transfer",
          source_session_id: id,
          target_session_id: id,
          source_table_id: session.table_id,
          target_table_id: targetTableId,
          metadata: {
            fromTableId: session.table_id,
            toTableId: targetTableId,
          },
        });

        return {
          session: updatedSession,
          sourceTableId: session.table_id,
          targetTableId,
        };
      });

      await publishTableLayoutChanged(tenant.branchId, {
        action: "transfer",
        sessionId: id,
        sourceTableId: result.sourceTableId,
        targetTableId: result.targetTableId,
      });

      return c.json({ success: true, data: result });
    } catch (e: any) {
      const messages: Record<string, string> = {
        ACTIVE_SESSION_NOT_FOUND: "Khong tim thay phien ban dang hoat dong.",
        SAME_TABLE: "Ban dich phai khac ban hien tai.",
        TARGET_TABLE_NOT_FOUND: "Khong tim thay ban dich trong chi nhanh.",
        TARGET_TABLE_OCCUPIED: "Ban dich dang co khach. Hay dung thao tac gop ban.",
        COMPLETED_ORDER_LOCKED: "Ban da co bill hoan tat, khong the chuyen/gop/tach.",
      };
      if (messages[e.message]) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: messages[e.message] } },
          400,
        );
      }
      throw e;
    }
  },
);

// POST /sessions/merge - Merge source sessions into a target active session
tables.post(
  "/sessions/merge",
  requirePermission("tables:update"),
  blockLiveOps,
  zValidator("json", tableMergeSchema),
  async (c) => {
    const { targetSessionId, sourceSessionIds } = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;
    const uniqueSourceIds = Array.from(new Set(sourceSessionIds)).filter(
      (sourceId) => sourceId !== targetSessionId,
    );

    if (uniqueSourceIds.length === 0) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Chon it nhat mot ban can gop." } },
        400,
      );
    }

    try {
      const result = await db.transaction(async (tx) => {
        const sessionIds = [targetSessionId, ...uniqueSourceIds];
        const sessions = await tx
          .select()
          .from(schema.tableSessions)
          .where(
            and(
              inArray(schema.tableSessions.id, sessionIds),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.organization_id, tenant.organizationId),
              eq(schema.tableSessions.status, "active"),
            ),
          );

        if (sessions.length !== sessionIds.length) throw new Error("SESSION_NOT_FOUND");

        const targetSession = sessions.find((session) => session.id === targetSessionId)!;
        const sourceSessions = sessions.filter((session) => uniqueSourceIds.includes(session.id));

        const [completedOrder] = await tx
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              inArray(schema.orders.table_session_id, sessionIds),
              eq(schema.orders.branch_id, tenant.branchId),
              eq(schema.orders.status, "completed"),
            ),
          )
          .limit(1);
        if (completedOrder) throw new Error("COMPLETED_ORDER_LOCKED");

        await tx
          .update(schema.orders)
          .set({ table_session_id: targetSessionId, updated_at: new Date() })
          .where(
            and(
              inArray(schema.orders.table_session_id, uniqueSourceIds),
              eq(schema.orders.branch_id, tenant.branchId),
              sql`orders.status != 'cancelled'`,
            ),
          );

        await tx
          .update(schema.tableSessions)
          .set({ status: "completed", ended_at: new Date() })
          .where(inArray(schema.tableSessions.id, uniqueSourceIds));

        await tx
          .update(schema.tables)
          .set({ status: "available" })
          .where(inArray(schema.tables.id, sourceSessions.map((session) => session.table_id)));

        await tx.insert(schema.tableSessionEvents).values(
          sourceSessions.map((sourceSession) => ({
            organization_id: tenant.organizationId,
            branch_id: tenant.branchId,
            actor_user_id: user.sub,
            action: "merge",
            source_session_id: sourceSession.id,
            target_session_id: targetSessionId,
            source_table_id: sourceSession.table_id,
            target_table_id: targetSession.table_id,
            metadata: {
              mergedSessionId: sourceSession.id,
              targetSessionId,
            },
          })),
        );

        return {
          targetSessionId,
          targetTableId: targetSession.table_id,
          sourceSessionIds: sourceSessions.map((session) => session.id),
          sourceTableIds: sourceSessions.map((session) => session.table_id),
        };
      });

      await publishTableLayoutChanged(tenant.branchId, {
        action: "merge",
        ...result,
      });

      return c.json({ success: true, data: result });
    } catch (e: any) {
      const messages: Record<string, string> = {
        SESSION_NOT_FOUND: "Khong tim thay day du cac phien ban dang hoat dong trong chi nhanh.",
        COMPLETED_ORDER_LOCKED: "Ban da co bill hoan tat, khong the chuyen/gop/tach.",
      };
      if (messages[e.message]) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: messages[e.message] } },
          400,
        );
      }
      throw e;
    }
  },
);

// POST /sessions/:id/split - Move selected item quantities to another table session
tables.post(
  "/sessions/:id/split",
  requirePermission("tables:update"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  zValidator("json", tableSplitSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { targetTableId, items } = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;
    const itemRequests = new Map(items.map((item) => [item.orderItemId, item.quantity]));

    try {
      const result = await db.transaction(async (tx) => {
        const [sourceSession] = await tx
          .select()
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.id, id),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);
        if (!sourceSession) throw new Error("ACTIVE_SESSION_NOT_FOUND");
        if (sourceSession.table_id === targetTableId) throw new Error("SAME_TABLE");

        const [targetTable] = await tx
          .select()
          .from(schema.tables)
          .where(
            and(
              eq(schema.tables.id, targetTableId),
              eq(schema.tables.branch_id, tenant.branchId),
              eq(schema.tables.organization_id, tenant.organizationId),
            ),
          )
          .limit(1);
        if (!targetTable) throw new Error("TARGET_TABLE_NOT_FOUND");

        const requestedItemIds = Array.from(itemRequests.keys());
        const sourceItems = await tx
          .select({
            item: schema.orderItems,
            order: schema.orders,
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.order_id, schema.orders.id))
          .where(
            and(
              inArray(schema.orderItems.id, requestedItemIds),
              eq(schema.orders.table_session_id, id),
              eq(schema.orders.branch_id, tenant.branchId),
              sql`orders.status NOT IN ('completed', 'cancelled')`,
            ),
          );

        if (sourceItems.length !== requestedItemIds.length) throw new Error("ITEM_NOT_FOUND");

        for (const row of sourceItems) {
          const quantity = itemRequests.get(row.item.id)!;
          if (quantity > row.item.quantity) throw new Error("INVALID_QUANTITY");
        }

        const [targetActive] = await tx
          .select()
          .from(schema.tableSessions)
          .where(
            and(
              eq(schema.tableSessions.table_id, targetTableId),
              eq(schema.tableSessions.branch_id, tenant.branchId),
              eq(schema.tableSessions.status, "active"),
            ),
          )
          .limit(1);

        let targetSession = targetActive;
        if (!targetSession) {
          const customerToken = await signCustomerToken({
            sub: crypto.randomUUID(),
            org: tenant.organizationId,
            branch: tenant.branchId,
            table: targetTableId,
          });
          [targetSession] = await tx
            .insert(schema.tableSessions)
            .values({
              organization_id: tenant.organizationId,
              branch_id: tenant.branchId,
              table_id: targetTableId,
              status: "active",
              customer_name: sourceSession.customer_name || "POS Staff",
              customer_phone: sourceSession.customer_phone,
              token: customerToken,
            })
            .returning();

          await tx
            .update(schema.tables)
            .set({ status: "occupied" })
            .where(eq(schema.tables.id, targetTableId));
        }

        const completedSessionIds = [id, targetSession.id];
        const [completedOrder] = await tx
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              inArray(schema.orders.table_session_id, completedSessionIds),
              eq(schema.orders.branch_id, tenant.branchId),
              eq(schema.orders.status, "completed"),
            ),
          )
          .limit(1);
        if (completedOrder) throw new Error("COMPLETED_ORDER_LOCKED");

        const [branch] = await tx
          .select({ tax_rate: schema.branches.tax_rate })
          .from(schema.branches)
          .where(eq(schema.branches.id, tenant.branchId))
          .limit(1);
        const taxRate = branch?.tax_rate ?? 1000;

        const sourceOrderIds = Array.from(new Set(sourceItems.map((row) => row.order.id)));
        const [targetOrder] = await tx
          .insert(schema.orders)
          .values({
            organization_id: tenant.organizationId,
            branch_id: tenant.branchId,
            table_session_id: targetSession.id,
            customer_id: null,
            order_number: generateOrderNumber(),
            type: "dine_in",
            status: "pending",
            customer_name: targetSession.customer_name,
            subtotal: 0,
            tax: 0,
            discount: 0,
            total: 0,
            notes: `Tach tu phien ${id}`,
          })
          .returning();

        let targetTotal = 0;
        const movedItems: any[] = [];

        for (const row of sourceItems) {
          const splitQty = itemRequests.get(row.item.id)!;
          const unitTotal = Math.round(row.item.total / row.item.quantity);
          const splitTotal = unitTotal * splitQty;
          targetTotal += splitTotal;

          const [newItem] = await tx
            .insert(schema.orderItems)
            .values({
              order_id: targetOrder.id,
              menu_item_id: row.item.menu_item_id,
              name: row.item.name,
              unit_price: row.item.unit_price,
              quantity: splitQty,
              total: splitTotal,
              notes: row.item.notes,
              status: row.item.status,
            })
            .returning();

          const modifiers = await tx
            .select()
            .from(schema.orderItemModifiers)
            .where(eq(schema.orderItemModifiers.order_item_id, row.item.id));
          if (modifiers.length > 0) {
            await tx.insert(schema.orderItemModifiers).values(
              modifiers.map((modifier) => ({
                order_item_id: newItem.id,
                modifier_id: modifier.modifier_id,
                name: modifier.name,
                price: modifier.price,
              })),
            );
          }

          if (splitQty === row.item.quantity) {
            await tx.delete(schema.orderItems).where(eq(schema.orderItems.id, row.item.id));
          } else {
            const remainingQty = row.item.quantity - splitQty;
            await tx
              .update(schema.orderItems)
              .set({
                quantity: remainingQty,
                // Lấy HIỆU chứ không nhân lại: `total` không chia hết cho số lượng
                // (dòng đã từng tách, hoặc tùy chọn lẻ) thì nhân lại làm rơi xu mỗi
                // lần tách, tổng bàn tụt dần mà không ai thấy.
                total: row.item.total - splitTotal,
              })
              .where(eq(schema.orderItems.id, row.item.id));
          }

          movedItems.push({
            sourceOrderItemId: row.item.id,
            targetOrderItemId: newItem.id,
            name: row.item.name,
            quantity: splitQty,
          });
        }

        await tx
          .update(schema.orders)
          .set({
            subtotal: targetTotal,
            tax: centsTax(targetTotal, taxRate),
            total: targetTotal,
            updated_at: new Date(),
          })
          .where(eq(schema.orders.id, targetOrder.id));

        for (const orderId of sourceOrderIds) {
          const [{ subtotal }] = await tx
            .select({
              subtotal: sql<number>`COALESCE(SUM(${schema.orderItems.total}), 0)::int`,
            })
            .from(schema.orderItems)
            .where(eq(schema.orderItems.order_id, orderId));

          if (subtotal <= 0) {
            await tx.delete(schema.orders).where(eq(schema.orders.id, orderId));
          } else {
            /*
             * ⚠️ PHẢI trừ lại `discount`. Bản cũ đặt `total = subtotal`, bỏ quên
             * khoản giảm giá đã ghi trên đơn — đơn 100.000đ giảm 20.000đ (total
             * 80.000) mà tách đi 30.000đ thì đơn nguồn thành total 70.000 thay vì
             * 50.000: tổng hai bàn TĂNG 20.000đ so với trước khi tách, và bất biến
             * `subtotal − discount = total` của createOrder bị phá.
             *
             * Kẹp `discount` theo subtotal mới: tách gần hết mà giữ nguyên mức giảm
             * cũ thì đơn còn lại thành âm tiền.
             */
            const [srcOrder] = await tx
              .select({ discount: schema.orders.discount })
              .from(schema.orders)
              .where(eq(schema.orders.id, orderId))
              .limit(1);
            const discount = Math.max(0, Math.min(srcOrder?.discount ?? 0, subtotal));
            const total = subtotal - discount;

            await tx
              .update(schema.orders)
              .set({
                subtotal,
                discount,
                tax: centsTax(total, taxRate),
                total,
                updated_at: new Date(),
              })
              .where(eq(schema.orders.id, orderId));
          }
        }

        const [{ remainingOrders }] = await tx
          .select({
            remainingOrders: sql<number>`COUNT(*)::int`,
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.table_session_id, id),
              eq(schema.orders.branch_id, tenant.branchId),
              sql`orders.status NOT IN ('completed', 'cancelled')`,
            ),
          );

        if (remainingOrders === 0) {
          await tx
            .update(schema.tableSessions)
            .set({ status: "completed", ended_at: new Date() })
            .where(eq(schema.tableSessions.id, id));
          await tx
            .update(schema.tables)
            .set({ status: "available" })
            .where(eq(schema.tables.id, sourceSession.table_id));
        }

        await tx.insert(schema.tableSessionEvents).values({
          organization_id: tenant.organizationId,
          branch_id: tenant.branchId,
          actor_user_id: user.sub,
          action: "split",
          source_session_id: id,
          target_session_id: targetSession.id,
          source_table_id: sourceSession.table_id,
          target_table_id: targetTableId,
          metadata: {
            targetOrderId: targetOrder.id,
            movedItems,
          },
        });

        return {
          sourceSessionId: id,
          targetSessionId: targetSession.id,
          sourceTableId: sourceSession.table_id,
          targetTableId,
          targetOrderId: targetOrder.id,
          movedItems,
          sourceClosed: remainingOrders === 0,
        };
      });

      await publishTableLayoutChanged(tenant.branchId, {
        action: "split",
        ...result,
      });

      return c.json({ success: true, data: result });
    } catch (e: any) {
      const messages: Record<string, string> = {
        ACTIVE_SESSION_NOT_FOUND: "Khong tim thay phien ban dang hoat dong.",
        SAME_TABLE: "Ban dich phai khac ban hien tai.",
        TARGET_TABLE_NOT_FOUND: "Khong tim thay ban dich trong chi nhanh.",
        ITEM_NOT_FOUND: "Mon can tach khong ton tai hoac da thanh toan/huy.",
        INVALID_QUANTITY: "So luong tach lon hon so luong hien co.",
        COMPLETED_ORDER_LOCKED: "Ban da co bill hoan tat, khong the chuyen/gop/tach.",
      };
      if (messages[e.message]) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: messages[e.message] } },
          400,
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
          total: schema.orderItems.total,
          notes: schema.orderItems.notes,
          status: schema.orderItems.status,
        })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.order_id, orderIds));

      // Tùy chọn của từng dòng món.
      // ⚠️ TỪNG innerJoin sang bảng `modifiers` hiện tại để lấy tên+giá: sửa giá tùy
      // chọn trong thực đơn là phiếu cũ đổi giá theo, còn xóa tùy chọn khỏi thực đơn
      // (modifier_id → NULL) là rớt hẳn dòng. Nay đọc snapshot lưu lúc bán.
      const modMap = await loadItemModifiers(items.map((it) => it.id));
      for (const item of items) {
        item.modifiers = modMap.get(item.id) || [];
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
