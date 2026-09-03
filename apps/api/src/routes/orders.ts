import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql, isNull, or, ne, lt, inArray, getTableColumns } from "drizzle-orm";
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
import { requirePermission, blockLiveOps } from "../middleware/rbac.js";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";
import { z } from "zod";
import { createOrder, addItemsToOrder, handleOrderCompletion, loadItemModifiers, OrderValidationError } from "../services/order.service.js";
import { signCustomerToken } from "../lib/jwt.js";
import { buildOrderTicketPayload, orderTicketEnvelope } from "../services/ticket.service.js";

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
        // Tên người bấm đơn. leftJoin: đơn cũ (trước 30/07/2026) và đơn khách tự gọi
        // không có người, phải ra null chứ không được làm mất dòng đơn.
        created_by_name: schema.users.name,
      })
      .from(schema.orders)
      .leftJoin(schema.tableSessions, eq(schema.orders.table_session_id, schema.tableSessions.id))
      .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
      .leftJoin(schema.users, eq(schema.orders.created_by, schema.users.id))
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

  // ⚠️ `pagination` phải nằm TRONG `data`. `apiFetch` phía web chỉ trả về
  // `json.data` — cái gì để ngoài là mất trắng. Trước đây để ngoài nên
  // `use-orders.ts` buộc phải tự viết `fetch` riêng, và bản tự viết đó THIẾU
  // phần tự làm mới phiên → hết hạn token là trang Đơn hàng chết trong khi các
  // trang khác vẫn chạy.
  return c.json({
    success: true,
    data: {
      orders: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});

// POST / - Create order
orders.post(
  "/",
  requirePermission("orders:create"),
  blockLiveOps,
  zValidator("json", createOrderSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    /**
     * Đơn ăn tại bàn thì BẮT BUỘC có bàn.
     *
     * ⚠️ Chặn ở đây chứ KHÔNG sửa `createOrderSchema` trong @restai/validators:
     * khách tự quét QR gọi món cũng gửi `type: "dine_in"` mà KHÔNG kèm tableId —
     * bàn suy ra từ phiên của khách ở ngay dưới. Thêm ràng buộc vào schema dùng
     * chung là chặn luôn cả khách gọi món.
     *
     * Trước đây máy chủ nhận tuốt: `table_session_id` nullable và chẳng ai đối
     * chiếu với `type`, nên đơn "ăn tại bàn" mà không có bàn vẫn vào sổ — bàn đó
     * không hiện đang có khách, tới lúc thu tiền mới lòi ra.
     */
    if (user.role !== "customer" && body.type === "dine_in" && !body.tableId && !body.tableSessionId) {
      return c.json(
        {
          success: false,
          error: { code: "TABLE_REQUIRED", message: "Đơn ăn tại bàn phải chọn bàn. Vào lại từ màn Bàn ăn." },
        },
        400,
      );
    }

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
        // Ca đã tra ở cổng chặn phía trên — đơn được cấp số 01, 02… theo ca
        registerShiftId: openShift.id,
        // Người bấm đơn. Đây là chỗ DUY NHẤT ghi lại được — suy qua ca làm thì cả
        // buổi chỉ có một tên (mỗi chi nhánh tối đa 1 ca mở).
        createdBy: user?.role === "customer" ? null : user?.sub ?? null,
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

    // Phiếu đặt món do TRẠM QUẦY in, không phải máy bấm đơn — nên gói tin phải
    // mang sẵn số bàn, tên người bấm đơn và tên tùy chọn từng món. Xem
    // `services/ticket.service.ts`.
    const ticket = await buildOrderTicketPayload({
      order: order as any,
      items: createdItems as any,
      branchId: tenant.branchId,
      staffUserId: user?.role === "customer" ? null : user?.sub ?? null,
    });
    const orderPayload = orderTicketEnvelope(ticket);
    await wsManager.publish(`branch:${tenant.branchId}`, orderPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, orderPayload);

    return c.json({ success: true, data: { ...order, items: createdItems } }, 201);
  },
);

// POST /:id/items - Thêm món vào đơn đang mở (khách mua thêm)
orders.post(
  "/:id/items",
  requirePermission("orders:create"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  zValidator("json", createOrderSchema.pick({ items: true })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { items } = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    let result;
    try {
      result = await addItemsToOrder({
        orderId: id,
        branchId: tenant.branchId,
        items,
        createdBy: user?.role === "customer" ? null : user?.sub ?? null,
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

    const { order, addedItems } = result;

    // ⚠️ PHẢI có `addOnId`: trạm quầy chống in trùng bằng `orderId`, nên phát tin
    // với cùng orderId là nó bỏ qua, món thêm ÂM THẦM không tới quầy. `addOnId` là
    // khóa riêng của lô thêm này. Phiếu chỉ gồm MÓN VỪA THÊM và có chữ "THÊM MÓN".
    const addOnId = `${order.id}:${addedItems[0]?.id ?? Date.now()}`;
    const ticket = await buildOrderTicketPayload({
      order: order as any,
      items: addedItems as any,
      branchId: tenant.branchId,
      staffUserId: user?.role === "customer" ? null : user?.sub ?? null,
      addOnId,
      // Giờ trên phiếu là giờ GỌI THÊM, không phải giờ mở đơn.
      createdAt: new Date().toISOString(),
    });
    const orderPayload = orderTicketEnvelope(ticket);
    await wsManager.publish(`branch:${tenant.branchId}`, orderPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, orderPayload);

    return c.json({ success: true, data: { ...order, addedItems } }, 201);
  },
);

/* ------------------------------------------------------------------------- *
 * SỔ GHI NHẬN IN PHIẾU
 *
 * ⚠️ Trước đây việc in là "bắn đi rồi quên": máy chủ đẩy `order:new` qua
 * WebSocket, Trạm quầy nghe được thì in, không nghe được thì thôi — và KHÔNG AI
 * BIẾT. Sáng 03/09/2026 mất phiếu cả hai kiểu (mất hẳn đơn khi máy quầy rớt
 * mạng; đơn nhiều ly ra thiếu tờ khi cầu in USB nuốt việc) mà không truy được
 * đơn nào, vì không có chỗ nào ghi lại.
 *
 * Ba đường dưới đây đóng vòng lặp: quầy in xong thì XÁC NHẬN, cái gì chưa xác
 * nhận thì quầy tự ĐÒI LẠI, và người ta IN LẠI được bằng tay.
 * ------------------------------------------------------------------------- */

const printAckSchema = z.object({
  /** Lô món thêm; bỏ trống = phiếu gốc của đơn. */
  addOnId: z.string().max(120).optional().nullable(),
  kind: z.enum(["kitchen", "receipt", "transfer"]).default("kitchen"),
  status: z.enum(["ok", "partial", "failed"]),
  ticketsTotal: z.number().int().min(1).max(200).default(1),
  ticketsOk: z.number().int().min(0).max(200).default(0),
  deviceLabel: z.string().max(120).optional().nullable(),
  error: z.string().max(500).optional().nullable(),
});

// POST /:id/print-ack — Trạm quầy báo về kết quả in (kể cả khi HỎNG).
orders.post(
  "/:id/print-ack",
  requirePermission("orders:read"),
  zValidator("param", idParamSchema),
  zValidator("json", printAckSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, id), eq(schema.orders.branch_id, tenant.branchId)))
      .limit(1);
    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "order_not_found") } },
        404,
      );
    }

    // Để ràng buộc UNIQUE làm việc chống trùng — đừng SELECT rồi mới INSERT, kiểu
    // đó vừa thua đường đua vừa ném 500 khi quầy gửi lại xác nhận cùng lúc.
    //
    // ⚠️ Lần in TỐT HƠN không được để lần xấu đè: in lại thành công sau một lần
    // hỏng phải nâng dòng lên 'ok'; hỏng thêm lần nữa thì giữ nguyên 'ok' cũ.
    await db
      .insert(schema.orderPrints)
      .values({
        order_id: id,
        add_on_id: body.addOnId ?? "",
        kind: body.kind,
        status: body.status,
        tickets_total: body.ticketsTotal,
        tickets_ok: body.ticketsOk,
        device_label: body.deviceLabel ?? null,
        error: body.error ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.orderPrints.order_id, schema.orderPrints.add_on_id, schema.orderPrints.kind],
        set: {
          status: sql`CASE WHEN order_prints.tickets_ok >= excluded.tickets_ok
                           THEN order_prints.status ELSE excluded.status END`,
          tickets_ok: sql`GREATEST(order_prints.tickets_ok, excluded.tickets_ok)`,
          tickets_total: sql`GREATEST(order_prints.tickets_total, excluded.tickets_total)`,
          device_label: sql`excluded.device_label`,
          error: sql`CASE WHEN excluded.status = 'ok' THEN NULL ELSE excluded.error END`,
          printed_at: sql`now()`,
        },
      });

    return c.json({ success: true, data: { ok: true } });
  },
);

// GET /unprinted — đơn của ca đang mở mà Trạm quầy CHƯA xác nhận in xong.
//
// Đây là lưới an toàn cho lúc máy quầy rớt mạng / tắt tab: lệnh in phát trong
// lúc đó mất vĩnh viễn (Redis pub/sub không lưu lịch sử), nên quầy phải tự quay
// lại hỏi "còn phiếu nào tôi chưa in không".
//
// ⚠️ Chỉ soi phiếu GỐC của đơn. Lô món thêm mất thì phải bấm "In lại" bằng tay —
// không dựng lại được lô nào gồm món nào từ dữ liệu.
orders.get("/unprinted", requirePermission("orders:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const [shift] = await db
    .select({ id: schema.registerShifts.id })
    .from(schema.registerShifts)
    .where(
      and(
        eq(schema.registerShifts.branch_id, tenant.branchId),
        eq(schema.registerShifts.status, "open"),
      ),
    )
    .limit(1);
  // Chưa mở ca thì không có gì để in — trả rỗng, không phải lỗi.
  if (!shift) return c.json({ success: true, data: [] });

  const rows = await db
    .select({
      id: schema.orders.id,
      order_number: schema.orders.order_number,
      status: schema.orders.status,
      customer_name: schema.orders.customer_name,
      type: schema.orders.type,
      table_session_id: schema.orders.table_session_id,
      created_at: schema.orders.created_at,
      created_by: schema.orders.created_by,
    })
    .from(schema.orders)
    .leftJoin(
      schema.orderPrints,
      and(
        eq(schema.orderPrints.order_id, schema.orders.id),
        eq(schema.orderPrints.kind, "kitchen"),
        eq(schema.orderPrints.add_on_id, ""),
      ),
    )
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        eq(schema.orders.register_shift_id, shift.id),
        ne(schema.orders.status, "cancelled"),
        // Chờ 30 giây rồi mới coi là thiếu: đủ để lượt in vừa phát đi kịp xác
        // nhận về, khỏi in lại ngay tờ đang chạy ra khỏi máy.
        lt(schema.orders.created_at, sql`now() - interval '30 seconds'`),
        // ⚠️ VÀ không quá 20 phút. Không có chặn trên này thì mọi đơn cũ trong ca
        // đều tính là "chưa in" — riêng lần deploy đầu, khi sổ còn trống, máy quầy
        // vừa tải lại là in xối xả cả trăm phiếu từ đầu ca. Quá 20 phút thì khách
        // đã về hoặc đã được phục vụ rồi, in ra chỉ tổ rác giấy: cần thì bấm "In
        // lại phiếu đặt món".
        sql`${schema.orders.created_at} > now() - interval '20 minutes'`,
        or(isNull(schema.orderPrints.id), ne(schema.orderPrints.status, "ok")),
      ),
    )
    .orderBy(schema.orders.created_at)
    // Cửa 20 phút nên danh sách vốn đã ngắn; chặn thêm để không bao giờ có
    // chuyện máy in nhả một tràng phiếu liên tục.
    .limit(10);

  if (!rows.length) return c.json({ success: true, data: [] });

  const items = await db
    .select({
      id: schema.orderItems.id,
      order_id: schema.orderItems.order_id,
      name: schema.orderItems.name,
      quantity: schema.orderItems.quantity,
      status: schema.orderItems.status,
      notes: schema.orderItems.notes,
      unit: schema.orderItems.unit,
    })
    .from(schema.orderItems)
    .where(
      inArray(
        schema.orderItems.order_id,
        rows.map((r) => r.id),
      ),
    );

  const byOrder = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push(it);
    byOrder.set(it.order_id, arr);
  }

  const payloads = [];
  for (const row of rows) {
    const list = byOrder.get(row.id) ?? [];
    if (!list.length) continue; // đơn rỗng thì không có gì để in
    payloads.push(
      await buildOrderTicketPayload({
        order: row as any,
        items: list as any,
        branchId: tenant.branchId,
        staffUserId: row.created_by,
      }),
    );
  }

  return c.json({ success: true, data: payloads });
});

// POST /:id/reprint — in lại phiếu đặt món qua Trạm quầy.
//
// Trước đây KHÔNG có đường nào lấy lại phiếu đặt món: mất là mất, chỉ còn cách
// vào màn Bếp bấm in trên đúng máy có máy in.
orders.post(
  "/:id/reprint",
  requirePermission("orders:read"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, id), eq(schema.orders.branch_id, tenant.branchId)))
      .limit(1);
    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "order_not_found") } },
        404,
      );
    }

    const items = await db
      .select({
        id: schema.orderItems.id,
        name: schema.orderItems.name,
        quantity: schema.orderItems.quantity,
        status: schema.orderItems.status,
        notes: schema.orderItems.notes,
        unit: schema.orderItems.unit,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, id));

    if (!items.length) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Đơn không có món để in." } },
        400,
      );
    }

    const ticket = await buildOrderTicketPayload({
      order: order as any,
      items: items as any,
      branchId: tenant.branchId,
      staffUserId: order.created_by,
      // ⚠️ Khóa MỚI mỗi lần bấm: quầy chống in trùng theo khóa này, dùng lại
      // `orderId` là lần in lại bị bỏ qua im lặng. Và KHÔNG mượn `addOnId` —
      // nó làm phiếu in ra chữ "THÊM MÓN" trong khi đây là phiếu gốc.
      reprintToken: `${order.id}:reprint:${Date.now()}`,
    });
    const envelope = orderTicketEnvelope(ticket);
    await wsManager.publish(`branch:${tenant.branchId}`, envelope);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, envelope);

    return c.json({ success: true, data: { ok: true } });
  },
);

// POST /session/:id/reprint — in lại phiếu của CẢ BÀN (mọi đơn của phiên).
//
// Thẻ bàn không cầm id từng đơn (đường mặc định cố ý không tải chi tiết đơn về
// máy), nên nút "In lại phiếu" ở đó gọi một lượt duy nhất thay vì bắt máy POS
// hỏi đường vòng rồi bắn N lệnh trên đường truyền chập chờn.
orders.post(
  "/session/:id/reprint",
  requirePermission("orders:read"),
  blockLiveOps,
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const rows = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        status: schema.orders.status,
        customer_name: schema.orders.customer_name,
        type: schema.orders.type,
        table_session_id: schema.orders.table_session_id,
        created_at: schema.orders.created_at,
        created_by: schema.orders.created_by,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          eq(schema.orders.table_session_id, id),
          ne(schema.orders.status, "cancelled"),
        ),
      )
      .orderBy(schema.orders.created_at);

    if (!rows.length) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "order_not_found") } },
        404,
      );
    }

    const items = await db
      .select({
        id: schema.orderItems.id,
        order_id: schema.orderItems.order_id,
        name: schema.orderItems.name,
        quantity: schema.orderItems.quantity,
        status: schema.orderItems.status,
        notes: schema.orderItems.notes,
        unit: schema.orderItems.unit,
      })
      .from(schema.orderItems)
      .where(
        inArray(
          schema.orderItems.order_id,
          rows.map((r) => r.id),
        ),
      );

    const byOrder = new Map<string, typeof items>();
    for (const it of items) {
      const arr = byOrder.get(it.order_id) ?? [];
      arr.push(it);
      byOrder.set(it.order_id, arr);
    }

    let sent = 0;
    for (const row of rows) {
      const list = byOrder.get(row.id) ?? [];
      if (!list.length) continue;
      const ticket = await buildOrderTicketPayload({
        order: row as any,
        items: list as any,
        branchId: tenant.branchId,
        staffUserId: row.created_by,
        reprintToken: `${row.id}:reprint:${Date.now()}`,
      });
      const envelope = orderTicketEnvelope(ticket);
      await wsManager.publish(`branch:${tenant.branchId}`, envelope);
      await wsManager.publish(`branch:${tenant.branchId}:kitchen`, envelope);
      sent++;
    }

    return c.json({ success: true, data: { orders: sent } });
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
      .select({
        ...getTableColumns(schema.orders),
        table_number: schema.tables.number,
        created_by_name: schema.users.name,
      })
      .from(schema.orders)
      .leftJoin(schema.tableSessions, eq(schema.orders.table_session_id, schema.tableSessions.id))
      .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
      .leftJoin(schema.users, eq(schema.orders.created_by, schema.users.id))
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

    // Tên người thêm TỪNG món: món gọi thêm giữa buổi thường do người khác bấm, và
    // đó là thứ hộp thoại chi tiết cần chỉ ra.
    const rawItems = await db
      .select({
        ...getTableColumns(schema.orderItems),
        created_by_name: schema.users.name,
      })
      .from(schema.orderItems)
      .leftJoin(schema.users, eq(schema.orderItems.created_by, schema.users.id))
      .where(eq(schema.orderItems.order_id, order.id))
      .orderBy(schema.orderItems.created_at);

    // Tùy chọn phải đi kèm: màn In lại hóa đơn (payments) đọc đúng endpoint này,
    // thiếu là hóa đơn in ra mất dòng giải thích chênh lệch giá.
    const modMap = await loadItemModifiers(rawItems.map((i) => i.id));
    const items = rawItems.map((i) => ({ ...i, modifiers: modMap.get(i.id) ?? [] }));

    // Các lần thu tiền — đơn có thể trả nhiều lần (một phần tiền mặt, một phần chuyển khoản).
    const payments = await db
      .select({
        id: schema.payments.id,
        method: schema.payments.method,
        amount: schema.payments.amount,
        status: schema.payments.status,
        created_at: schema.payments.created_at,
      })
      .from(schema.payments)
      .where(eq(schema.payments.order_id, order.id))
      .orderBy(schema.payments.created_at);

    return c.json({ success: true, data: { ...order, items, payments } });
  },
);

// PATCH /:id/status
orders.patch(
  "/:id/status",
  requirePermission("orders:update"),
  blockLiveOps,
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
  blockLiveOps,
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
