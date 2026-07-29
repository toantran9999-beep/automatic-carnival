import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, ne, and, gte, lte, lt, sql, desc, inArray, count, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { reportQuerySchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { peruStartOfDay, peruEndOfDay } from "../lib/timezone.js";
import { t } from "../lib/i18n.js";

const reports = new Hono<AppEnv>();

reports.use("*", authMiddleware);
reports.use("*", tenantMiddleware);

/**
 * Resolves whether a report should be scoped to a single branch or aggregated
 * across all branches of the organization.
 *
 * "All branches" is only honoured for users with global access
 * (super_admin / org_admin) and when `?allBranches=true` is passed.
 * Otherwise a branch must be selected (x-branch-id header).
 *
 * Returns either { ok: false, response } (caller should return it) or
 * { ok: true, useAll, orgCondition } where orgCondition is the SQL filter to
 * apply to the `orders` table.
 */
function resolveReportScope(c: any) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const hasGlobalAccess = user?.role === "super_admin" || user?.role === "org_admin";
  const useAll = c.req.query("allBranches") === "true" && hasGlobalAccess;

  if (!useAll && !tenant?.branchId) {
    return {
      ok: false as const,
      response: c.json(
        { success: false, error: { code: "BAD_REQUEST", message: t(c, "branch_header_required") } },
        400,
      ),
    };
  }

  const ordersCondition = useAll
    ? eq(schema.orders.organization_id, tenant.organizationId)
    : eq(schema.orders.branch_id, tenant.branchId);

  return { ok: true as const, useAll, tenant, ordersCondition };
}

// GET /dashboard - Dashboard stats
reports.get("/dashboard", requirePermission("reports:read"), async (c) => {
  const scope = resolveReportScope(c);
  if (!scope.ok) return scope.response;
  const { useAll, tenant, ordersCondition } = scope;

  const today = peruStartOfDay();

  // Today's orders
  const [orderStats] = await db
    .select({
      totalOrders: count(),
      totalRevenue: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(
      and(
        ordersCondition,
        gte(schema.orders.created_at, today),
      ),
    );

  // Active orders
  const [activeStats] = await db
    .select({ count: count() })
    .from(schema.orders)
    .where(
      and(
        ordersCondition,
        inArray(schema.orders.status, ["pending", "confirmed", "preparing", "ready"]),
      ),
    );

  // Table stats
  const allTables = await db
    .select({ status: schema.tables.status })
    .from(schema.tables)
    .where(
      useAll
        ? eq(schema.tables.organization_id, tenant.organizationId)
        : eq(schema.tables.branch_id, tenant.branchId),
    );

  const totalTables = allTables.length;
  const occupiedTables = allTables.filter((t) => t.status === "occupied").length;

  const avgOrderValue =
    orderStats.totalOrders > 0
      ? Math.round(Number(orderStats.totalRevenue || 0) / orderStats.totalOrders)
      : 0;

  return c.json({
    success: true,
    data: {
      totalOrders: orderStats.totalOrders,
      totalRevenue: Number(orderStats.totalRevenue || 0),
      averageOrderValue: avgOrderValue,
      activeOrders: activeStats.count,
      occupiedTables,
      totalTables,
    },
  });
});

/**
 * GET /overview - Toàn bộ dữ liệu cho trang Tổng quan (quản lý) trong 1 lần gọi.
 * Chỉ role có `reports:read` (super_admin/org_admin/branch_manager) truy cập được.
 * Tất cả mốc thời gian theo NGÀY GIỜ VIỆT NAM (UTC+7) qua peruStartOfDay/peruEndOfDay;
 * gom nhóm theo giờ/ngày trong SQL bằng cách cộng `interval '7 hours'` trước khi to_char.
 * Tiền để nguyên đơn vị cents (frontend chia 100 / formatCurrency).
 */
reports.get("/overview", requirePermission("reports:read"), async (c) => {
  const scope = resolveReportScope(c);
  if (!scope.ok) return scope.response;
  const { useAll, tenant, ordersCondition } = scope;

  const todayStart = peruStartOfDay();
  const todayEnd = peruEndOfDay();
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  // Điều kiện đơn hoàn tất trong khoảng [from, to)
  const completedBetween = (from: Date, to: Date) =>
    and(
      ordersCondition,
      eq(schema.orders.status, "completed"),
      gte(schema.orders.created_at, from),
      lt(schema.orders.created_at, to),
    );

  const hourExpr = sql<string>`to_char(${schema.orders.created_at} + interval '7 hours', 'HH24')`;
  const dayExpr = sql<string>`to_char(${schema.orders.created_at} + interval '7 hours', 'YYYY-MM-DD')`;

  const tablesScope = useAll
    ? eq(schema.tables.organization_id, tenant.organizationId)
    : eq(schema.tables.branch_id, tenant.branchId);

  const [
    todayTotals,
    yesterdayTotals,
    activeStats,
    cancelledStats,
    allTables,
    hourlyRows,
    dayRows,
    paymentRows,
    topItemRows,
    orderTypeRows,
    openTablesTotals,
    openTakeawayTotals,
  ] = await Promise.all([
    // 1. Tổng hôm nay (hoàn tất)
    db
      .select({ orders: count(), revenue: sum(schema.orders.total) })
      .from(schema.orders)
      .where(completedBetween(todayStart, todayEnd)),
    // 2. Tổng hôm qua (để tính delta)
    db
      .select({ orders: count(), revenue: sum(schema.orders.total) })
      .from(schema.orders)
      .where(completedBetween(yesterdayStart, todayStart)),
    // 3. Đơn đang xử lý (không giới hạn theo ngày)
    db
      .select({ count: count() })
      .from(schema.orders)
      .where(and(ordersCondition, inArray(schema.orders.status, ["pending", "confirmed", "preparing", "ready"]))),
    // 4. Đơn hủy hôm nay
    db
      .select({ count: count() })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          eq(schema.orders.status, "cancelled"),
          gte(schema.orders.created_at, todayStart),
          lt(schema.orders.created_at, todayEnd),
        ),
      ),
    // 5. Bàn
    db.select({ status: schema.tables.status }).from(schema.tables).where(tablesScope),
    // 6. Doanh thu theo giờ hôm nay (giờ VN)
    db
      .select({ hour: hourExpr, orders: count(), revenue: sum(schema.orders.total) })
      .from(schema.orders)
      .where(completedBetween(todayStart, todayEnd))
      .groupBy(hourExpr)
      .orderBy(hourExpr),
    // 7. Doanh thu 7 ngày (ngày VN)
    db
      .select({ date: dayExpr, orders: count(), revenue: sum(schema.orders.total) })
      .from(schema.orders)
      .where(completedBetween(weekStart, todayEnd))
      .groupBy(dayExpr)
      .orderBy(dayExpr),
    // 8. Tiền theo phương thức thanh toán hôm nay (số tiền, không phải %)
    db
      .select({ method: schema.payments.method, amount: sum(schema.payments.amount), count: count() })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.order_id, schema.orders.id))
      .where(and(completedBetween(todayStart, todayEnd), eq(schema.payments.status, "completed")))
      .groupBy(schema.payments.method),
    // 9. Món bán chạy hôm nay (top 5, theo tên snapshot vì menu_item_id có thể null)
    db
      .select({
        name: schema.orderItems.name,
        quantity: sum(schema.orderItems.quantity),
        revenue: sum(schema.orderItems.total),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.order_id, schema.orders.id))
      .where(completedBetween(todayStart, todayEnd))
      .groupBy(schema.orderItems.name)
      .orderBy(desc(sum(schema.orderItems.total)))
      .limit(5),
    // 10. Cơ cấu loại đơn hôm nay (tại quán / mang đi / giao)
    db
      .select({ type: schema.orders.type, orders: count(), revenue: sum(schema.orders.total) })
      .from(schema.orders)
      .where(completedBetween(todayStart, todayEnd))
      .groupBy(schema.orders.type),
    // 11. Tiền đang nằm ở các bàn có khách (hóa đơn còn mở, chưa thu)
    //
    // ⚠️ Phải khớp đúng cách trang Bàn ăn tính tiền từng bàn (routes/tables.ts):
    // phiên bàn đang `active` + BỎ đơn đã huỷ. Lệch một trong hai là số ở Bảng
    // điều khiển không cộng ra được từ các thẻ bàn, xem một đằng một nẻo.
    //
    // Không giới hạn theo ngày: bàn mở từ tối qua chưa thanh toán vẫn là tiền đang treo.
    db
      .select({ total: sum(schema.orders.total) })
      .from(schema.orders)
      .innerJoin(
        schema.tableSessions,
        eq(schema.orders.table_session_id, schema.tableSessions.id),
      )
      .where(
        and(
          ordersCondition,
          eq(schema.tableSessions.status, "active"),
          ne(schema.orders.status, "cancelled"),
        ),
      ),
    // 12. Đơn MANG VỀ đang mở (chưa thu tiền, chưa huỷ)
    //
    // ⚠️ Phải định nghĩa "đang mở" Y HỆT `GET /tables/takeaway` (routes/tables.ts):
    // `type = 'takeout'` AND `status NOT IN ('completed','cancelled')`. Lệch một
    // chút là số ở Bảng điều khiển không cộng ra được từ các thẻ ở tab Mang về —
    // chủ quán xem một đằng một nẻo.
    //
    // ⚠️ KHÔNG giới hạn theo ngày: đơn mang về từ tối qua chưa thu vẫn là việc
    // chưa xong. Giống truy vấn 11 ở trên.
    //
    // ⚠️ KHÔNG chồng lấn `openTablesRevenue` (truy vấn 11 chỉ tính đơn gắn phiên
    // bàn, còn đây là đơn mang về không có phiên bàn) — cộng hai số lại mới ra
    // toàn bộ tiền đang treo, không sợ đếm hai lần.
    db
      .select({ count: count(), total: sum(schema.orders.total) })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          eq(schema.orders.type, "takeout"),
          sql`orders.status NOT IN ('completed','cancelled')`,
        ),
      ),
  ]);

  const todayOrders = Number(todayTotals[0]?.orders || 0);
  const todayRevenue = Number(todayTotals[0]?.revenue || 0);
  const yOrders = Number(yesterdayTotals[0]?.orders || 0);
  const yRevenue = Number(yesterdayTotals[0]?.revenue || 0);

  const pct = (curr: number, prev: number): number | null =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

  // Zero-fill 7 ngày VN theo thứ tự tăng dần
  const dayMap = new Map(dayRows.map((d) => [d.date, d]));
  const days: { date: string; orders: number; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const inst = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000);
    const key = inst.toISOString().slice(0, 10); // YYYY-MM-DD giờ VN
    const row = dayMap.get(key);
    days.push({
      date: key,
      orders: row ? Number(row.orders || 0) : 0,
      revenue: row ? Number(row.revenue || 0) : 0,
    });
  }

  const totalTables = allTables.length;
  const occupiedTables = allTables.filter((t) => t.status === "occupied").length;

  return c.json({
    success: true,
    data: {
      today: {
        orders: todayOrders,
        revenue: todayRevenue,
        averageOrderValue: todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0,
        activeOrders: Number(activeStats[0]?.count || 0),
        cancelledOrders: Number(cancelledStats[0]?.count || 0),
        occupiedTables,
        totalTables,
        /** Tiền đang treo ở các bàn còn khách — chưa thu, nên KHÔNG cộng vào doanh thu. */
        openTablesRevenue: Number(openTablesTotals[0]?.total || 0),
        /** Đơn mang về chưa thu tiền (mọi ngày, không riêng hôm nay). */
        openTakeawayOrders: Number(openTakeawayTotals[0]?.count || 0),
        /** Tiền đang treo ở các đơn mang về — cũng chưa thu, KHÔNG cộng vào doanh thu. */
        openTakeawayRevenue: Number(openTakeawayTotals[0]?.total || 0),
      },
      yesterday: { orders: yOrders, revenue: yRevenue },
      deltas: { revenuePct: pct(todayRevenue, yRevenue), ordersPct: pct(todayOrders, yOrders) },
      hourly: hourlyRows.map((h) => ({
        hour: Number(h.hour),
        orders: Number(h.orders || 0),
        revenue: Number(h.revenue || 0),
      })),
      days,
      paymentMethods: paymentRows.map((p) => ({
        method: p.method,
        amount: Number(p.amount || 0),
        count: Number(p.count || 0),
      })),
      topItems: topItemRows.map((it) => ({
        name: it.name,
        quantity: Number(it.quantity || 0),
        revenue: Number(it.revenue || 0),
      })),
      orderTypes: orderTypeRows.map((o) => ({
        type: o.type,
        orders: Number(o.orders || 0),
        revenue: Number(o.revenue || 0),
      })),
    },
  });
});

/**
 * GET /history - Lịch sử bán hàng từ POS CŨ (trước 26/07/2026).
 *
 * Đọc `sales_history_daily` / `sales_history_items` — hai bảng chỉ chứa dữ liệu nhập
 * một lần từ bản xuất Excel của hệ thống cũ, KHÔNG dính gì tới `orders`. Nhờ vậy
 * trang Tổng quan so được "tháng này với tháng trước" thay vì bắt đầu lại từ 0 vào
 * ngày chuyển hệ thống.
 *
 * ⚠️ KHÔNG cộng `interval '7 hours'` như các endpoint khác: `business_date` đã là
 * kiểu `date` theo giờ VN sẵn rồi, cộng thêm là lệch một ngày.
 *
 * Không có dữ liệu theo GIỜ: bản xuất cũ chỉ cho tổng theo giờ của cả năm, không tách
 * được theo ngày, nên không cắt theo khoảng thời gian được. Thứ trong tuần thì ngược
 * lại — suy ra được từ `business_date` nên vẫn lọc theo khoảng được.
 */
reports.get("/history", requirePermission("reports:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  if (!tenant?.branchId) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: t(c, "branch_header_required") } },
      400,
    );
  }

  const branchScope = eq(schema.salesHistoryDaily.branch_id, tenant.branchId);
  const itemScope = eq(schema.salesHistoryItems.branch_id, tenant.branchId);

  const monthExpr = sql<string>`to_char(${schema.salesHistoryDaily.business_date}, 'YYYY-MM')`;
  // 0 = Chủ nhật … 6 = Thứ bảy (quy ước của Postgres, frontend tự đặt tên).
  const dowExpr = sql<number>`extract(dow from ${schema.salesHistoryDaily.business_date})::int`;

  const [totals, monthly, weekday, topItems] = await Promise.all([
    db
      .select({
        days: count(),
        revenue: sum(schema.salesHistoryDaily.revenue),
        orders: sum(schema.salesHistoryDaily.order_count),
        first: sql<string>`min(${schema.salesHistoryDaily.business_date})`,
        last: sql<string>`max(${schema.salesHistoryDaily.business_date})`,
      })
      .from(schema.salesHistoryDaily)
      .where(branchScope),
    db
      .select({
        month: monthExpr,
        days: count(),
        revenue: sum(schema.salesHistoryDaily.revenue),
        orders: sum(schema.salesHistoryDaily.order_count),
      })
      .from(schema.salesHistoryDaily)
      .where(branchScope)
      .groupBy(monthExpr)
      .orderBy(monthExpr),
    db
      .select({
        dow: dowExpr,
        days: count(),
        revenue: sum(schema.salesHistoryDaily.revenue),
        orders: sum(schema.salesHistoryDaily.order_count),
      })
      .from(schema.salesHistoryDaily)
      .where(branchScope)
      .groupBy(dowExpr)
      .orderBy(dowExpr),
    db
      .select({
        name: schema.salesHistoryItems.item_name,
        group: schema.salesHistoryItems.group_name,
        quantity: sum(schema.salesHistoryItems.quantity),
        revenue: sum(schema.salesHistoryItems.revenue),
      })
      .from(schema.salesHistoryItems)
      .where(itemScope)
      .groupBy(schema.salesHistoryItems.item_name, schema.salesHistoryItems.group_name)
      .orderBy(desc(sum(schema.salesHistoryItems.revenue)))
      .limit(20),
  ]);

  const total = totals[0];
  const num = (v: unknown) => Number(v || 0);

  return c.json({
    success: true,
    data: {
      /** Chưa nhập lịch sử thì frontend ẩn hẳn khối này đi. */
      available: num(total?.days) > 0,
      range: { first: total?.first ?? null, last: total?.last ?? null },
      totals: {
        days: num(total?.days),
        revenue: num(total?.revenue),
        orders: num(total?.orders),
      },
      monthly: monthly.map((m) => ({
        month: m.month,
        days: num(m.days),
        revenue: num(m.revenue),
        orders: num(m.orders),
      })),
      weekday: weekday.map((w) => ({
        dow: num(w.dow),
        days: num(w.days),
        revenue: num(w.revenue),
        orders: num(w.orders),
      })),
      topItems: topItems.map((it) => ({
        name: it.name,
        group: it.group,
        quantity: num(it.quantity),
        revenue: num(it.revenue),
      })),
    },
  });
});

// GET /sales - Sales summary with daily breakdown and payment methods
reports.get(
  "/sales",
  requirePermission("reports:read"),
  zValidator("query", reportQuerySchema),
  async (c) => {
    const { startDate, endDate } = c.req.valid("query");
    const scope = resolveReportScope(c);
    if (!scope.ok) return scope.response;
    const { useAll, tenant, ordersCondition } = scope;

    const start = new Date(startDate);
    const end = new Date(endDate);
    // Set end to end of day
    end.setHours(23, 59, 59, 999);

    // Totals for the range
    const [totals] = await db
      .select({
        totalOrders: count(),
        totalRevenue: sum(schema.orders.total),
        totalTax: sum(schema.orders.tax),
        totalDiscount: sum(schema.orders.discount),
      })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          eq(schema.orders.status, "completed"),
        ),
      );

    // Daily breakdown
    const dailyData = await db
      .select({
        date: sql<string>`to_char(${schema.orders.created_at}, 'YYYY-MM-DD')`,
        orders: count(),
        revenue: sum(schema.orders.total),
      })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          eq(schema.orders.status, "completed"),
        ),
      )
      .groupBy(sql`to_char(${schema.orders.created_at}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${schema.orders.created_at}, 'YYYY-MM-DD')`);

    // Per-branch breakdown (only meaningful in all-branches mode)
    let branches: { branchId: string; name: string; orders: number; revenue: number }[] = [];
    if (useAll) {
      const branchRows = await db
        .select({
          branchId: schema.orders.branch_id,
          name: schema.branches.name,
          orders: count(),
          revenue: sum(schema.orders.total),
        })
        .from(schema.orders)
        .innerJoin(schema.branches, eq(schema.branches.id, schema.orders.branch_id))
        .where(
          and(
            eq(schema.orders.organization_id, tenant.organizationId),
            gte(schema.orders.created_at, start),
            lte(schema.orders.created_at, end),
            eq(schema.orders.status, "completed"),
          ),
        )
        .groupBy(schema.orders.branch_id, schema.branches.name)
        .orderBy(desc(sum(schema.orders.total)));
      branches = branchRows.map((b) => ({
        branchId: b.branchId,
        name: b.name,
        orders: b.orders,
        revenue: Number(b.revenue || 0),
      }));
    }

    // Payment method breakdown - join completed orders with payments
    const completedOrders = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          eq(schema.orders.status, "completed"),
        ),
      );

    let paymentMethods: { name: string; value: number }[] = [];
    if (completedOrders.length > 0) {
      const orderIds = completedOrders.map((o) => o.id);
      const pmData = await db
        .select({
          method: schema.payments.method,
          total: sum(schema.payments.amount),
        })
        .from(schema.payments)
        .where(
          and(
            inArray(schema.payments.order_id, orderIds),
            eq(schema.payments.status, "completed"),
          ),
        )
        .groupBy(schema.payments.method);

      const grandTotal = pmData.reduce((s, p) => s + Number(p.total || 0), 0);
      paymentMethods = pmData.map((p) => ({
        name: p.method,
        value: grandTotal > 0 ? Math.round((Number(p.total || 0) / grandTotal) * 100) : 0,
      }));
    }

    return c.json({
      success: true,
      data: {
        totalOrders: totals.totalOrders,
        totalRevenue: Number(totals.totalRevenue || 0),
        totalTax: Number(totals.totalTax || 0),
        totalDiscount: Number(totals.totalDiscount || 0),
        days: dailyData.map((d) => ({
          date: d.date,
          orders: d.orders,
          revenue: Number(d.revenue || 0),
        })),
        paymentMethods,
        branches,
      },
    });
  },
);

// GET /top-items - Top selling items
reports.get(
  "/top-items",
  requirePermission("reports:read"),
  zValidator("query", reportQuerySchema),
  async (c) => {
    const { startDate, endDate } = c.req.valid("query");
    const scope = resolveReportScope(c);
    if (!scope.ok) return scope.response;
    const { ordersCondition } = scope;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 50) : 10;

    // Get completed orders in range
    const completedOrders = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          ordersCondition,
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          eq(schema.orders.status, "completed"),
        ),
      );

    if (completedOrders.length === 0) {
      return c.json({ success: true, data: [] });
    }

    const orderIds = completedOrders.map((o) => o.id);

    const topItems = await db
      .select({
        name: schema.orderItems.name,
        totalQuantity: sum(schema.orderItems.quantity),
        totalRevenue: sum(schema.orderItems.total),
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.order_id, orderIds))
      .groupBy(schema.orderItems.name)
      .orderBy(desc(sum(schema.orderItems.quantity)))
      .limit(limit);

    return c.json({
      success: true,
      data: topItems.map((item) => ({
        name: item.name,
        totalQuantity: Number(item.totalQuantity || 0),
        totalRevenue: Number(item.totalRevenue || 0),
      })),
    });
  },
);

export { reports };
