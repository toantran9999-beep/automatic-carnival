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

/**
 * Ngày làm ăn theo giờ VN của một đơn, dạng 'YYYY-MM-DD'.
 *
 * 🔴 DB chạy múi giờ UTC. Không cộng 7 tiếng thì đơn buổi sáng 6–7h giờ VN
 * (= 23h–0h UTC hôm trước) bị tính sang NGÀY HÔM TRƯỚC — mà đó lại đúng là giờ cao
 * điểm của quán, tức ~10–15% đơn mỗi ngày rơi nhầm. Mọi chỗ gom đơn theo ngày đều
 * phải dùng hàm này, đừng viết lại `to_char` bằng tay.
 */
const vnDayExpr = sql<string>`to_char(${schema.orders.created_at} + interval '7 hours', 'YYYY-MM-DD')`;
const vnMonthExpr = sql<string>`to_char(${schema.orders.created_at} + interval '7 hours', 'YYYY-MM')`;

/** Khoảng ngày VN [start, end] áp lên `orders.created_at` (so bằng chuỗi ngày, khỏi lệch múi giờ). */
function ordersInVnRange(startDate: string, endDate: string) {
  return sql`to_char(${schema.orders.created_at} + interval '7 hours', 'YYYY-MM-DD') BETWEEN ${startDate} AND ${endDate}`;
}

/**
 * Ngày cuối cùng mà dữ liệu đến từ HỆ THỐNG CŨ (bảng `sales_history_*`).
 *
 * Lấy từ chính dữ liệu chứ không viết cứng, để nhập thêm/bớt lịch sử là tự đúng.
 * Chưa nhập gì → null → mọi báo cáo chạy y như trước.
 *
 * Quy tắc chống trùng ở mọi chỗ hợp nhất: **ngày ≤ cutover lấy bảng lịch sử, ngày >
 * cutover lấy `orders`** — không bao giờ cộng cả hai nguồn cho cùng một ngày.
 */
async function getLegacyCutover(branchId: string): Promise<string | null> {
  const [row] = await db
    .select({ cutover: sql<string | null>`max(${schema.salesHistoryDaily.business_date})` })
    .from(schema.salesHistoryDaily)
    .where(eq(schema.salesHistoryDaily.branch_id, branchId));
  return row?.cutover ?? null;
}

const nextDay = (isoDate: string) =>
  new Date(new Date(isoDate + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

/**
 * Tên món của hệ cũ → tên tương ứng của hệ mới.
 *
 * Hệ cũ tách độ đậm thành SKU RIÊNG ("Cà phê đá (nhẹ)" 13.000đ), hệ mới để nó là tuỳ
 * chọn "Nhẹ −2.000đ" trên chính món gốc. Không gộp lại thì bảng món bán chạy xuyên kỳ
 * hiện hai dòng cho cùng một món, và "Cà phê đá" bị hụt ~10% ở phần lịch sử.
 */
const LEGACY_ITEM_ALIASES: Record<string, string> = {
  "Cà phê đá (nhẹ)": "Cà phê đá",
  "Cà phê sữa đá (nhẹ)": "Cà phê sữa đá",
  "Trà đường (Trà lài)": "Trà lài",
  "Cà phê bột Toda 1 (500g)": "Cà phê Toda 1 (500g)",
};

const canonicalItemName = (name: string) => LEGACY_ITEM_ALIASES[name] ?? name;

/** Nhóm mà POS cũ dùng để ghi tuỳ chọn (giá 0đ) — không phải món, phải loại khỏi top món. */
const LEGACY_MODIFIER_GROUP = "Đường sữa";

/** Khoảng dài hơn mức này thì gom theo tháng — 365 điểm trên một biểu đồ là không đọc được. */
const MAX_DAYS_FOR_DAILY_GRANULARITY = 92;

function daysBetween(startDate: string, endDate: string): number {
  const ms =
    new Date(endDate + "T00:00:00Z").getTime() - new Date(startDate + "T00:00:00Z").getTime();
  return Math.floor(ms / 86400000) + 1;
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

    // Mốc nối cũ↔mới. Chế độ "tất cả chi nhánh" thì bỏ qua lịch sử: bản xuất cũ chỉ
    // có của chi nhánh chính, trộn vào sẽ ra tổng nửa vời không giải thích được.
    const cutover = useAll ? null : await getLegacyCutover(tenant.branchId);
    /** Phần khoảng ngày do dữ liệu cũ phụ trách: [startDate, min(endDate, cutover)]. */
    const legacyEnd = cutover && startDate <= cutover ? (endDate < cutover ? endDate : cutover) : null;
    /** Phần do đơn thật phụ trách: [max(startDate, cutover+1), endDate]. */
    const liveStart = cutover ? (startDate > cutover ? startDate : nextDay(cutover)) : startDate;
    const hasLive = liveStart <= endDate;

    const legacyScope = legacyEnd
      ? and(
          eq(schema.salesHistoryDaily.branch_id, tenant.branchId),
          gte(schema.salesHistoryDaily.business_date, startDate),
          lte(schema.salesHistoryDaily.business_date, legacyEnd),
        )
      : undefined;

    const liveScope = and(
      ordersCondition,
      eq(schema.orders.status, "completed"),
      ordersInVnRange(liveStart, endDate),
    );

    const granularity: "day" | "month" =
      daysBetween(startDate, endDate) > MAX_DAYS_FOR_DAILY_GRANULARITY ? "month" : "day";

    const [liveTotals, legacyTotals, liveBuckets, legacyBuckets, liveDow, legacyDow] =
      await Promise.all([
        hasLive
          ? db
              .select({
                orders: count(),
                revenue: sum(schema.orders.total),
                tax: sum(schema.orders.tax),
                discount: sum(schema.orders.discount),
              })
              .from(schema.orders)
              .where(liveScope)
          : Promise.resolve([]),
        legacyScope
          ? db
              .select({
                days: count(),
                orders: sum(schema.salesHistoryDaily.order_count),
                revenue: sum(schema.salesHistoryDaily.revenue),
              })
              .from(schema.salesHistoryDaily)
              .where(legacyScope)
          : Promise.resolve([]),
        // Gom theo ngày hoặc theo tháng, tuỳ độ dài khoảng đã chọn.
        hasLive
          ? (() => {
              const bucket = granularity === "month" ? vnMonthExpr : vnDayExpr;
              return db
                .select({ bucket, orders: count(), revenue: sum(schema.orders.total) })
                .from(schema.orders)
                .where(liveScope)
                .groupBy(bucket)
                .orderBy(bucket);
            })()
          : Promise.resolve([]),
        legacyScope
          ? (() => {
              const bucket =
                granularity === "month"
                  ? sql<string>`to_char(${schema.salesHistoryDaily.business_date}, 'YYYY-MM')`
                  : sql<string>`to_char(${schema.salesHistoryDaily.business_date}, 'YYYY-MM-DD')`;
              return db
                .select({
                  bucket,
                  orders: sum(schema.salesHistoryDaily.order_count),
                  revenue: sum(schema.salesHistoryDaily.revenue),
                })
                .from(schema.salesHistoryDaily)
                .where(legacyScope)
                .groupBy(bucket)
                .orderBy(bucket);
            })()
          : Promise.resolve([]),
        // Theo thứ trong tuần: cần cả SỐ NGÀY để chia trung bình, không so tổng.
        hasLive
          ? db
              .select({
                dow: sql<number>`extract(dow from ${schema.orders.created_at} + interval '7 hours')::int`,
                days: sql<number>`count(distinct to_char(${schema.orders.created_at} + interval '7 hours', 'YYYY-MM-DD'))::int`,
                orders: count(),
                revenue: sum(schema.orders.total),
              })
              .from(schema.orders)
              .where(liveScope)
              .groupBy(sql`extract(dow from ${schema.orders.created_at} + interval '7 hours')`)
          : Promise.resolve([]),
        legacyScope
          ? db
              .select({
                dow: sql<number>`extract(dow from ${schema.salesHistoryDaily.business_date})::int`,
                days: count(),
                orders: sum(schema.salesHistoryDaily.order_count),
                revenue: sum(schema.salesHistoryDaily.revenue),
              })
              .from(schema.salesHistoryDaily)
              .where(legacyScope)
              .groupBy(sql`extract(dow from ${schema.salesHistoryDaily.business_date})`)
          : Promise.resolve([]),
      ]);

    const n = (v: unknown) => Number(v || 0);

    const totals = {
      totalOrders: n(liveTotals[0]?.orders) + n(legacyTotals[0]?.orders),
      totalRevenue: n(liveTotals[0]?.revenue) + n(legacyTotals[0]?.revenue),
      // Thuế/giảm giá chỉ có ở đơn thật; bản xuất cũ không lưu (và thực tế luôn bằng 0).
      totalTax: n(liveTotals[0]?.tax),
      totalDiscount: n(liveTotals[0]?.discount),
    };

    // Hai nguồn không chồng ngày nên chỉ cần nối rồi sắp lại, không phải cộng dồn.
    const dailyData = [...legacyBuckets, ...liveBuckets]
      .map((b) => ({ date: b.bucket, orders: n(b.orders), revenue: n(b.revenue) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dowAcc = new Map<number, { days: number; orders: number; revenue: number }>();
    for (const row of [...legacyDow, ...liveDow]) {
      const key = n(row.dow);
      const acc = dowAcc.get(key) ?? { days: 0, orders: 0, revenue: 0 };
      acc.days += n(row.days);
      acc.orders += n(row.orders);
      acc.revenue += n(row.revenue);
      dowAcc.set(key, acc);
    }
    const weekday = [...dowAcc.entries()]
      .map(([dow, a]) => ({
        dow,
        days: a.days,
        orders: a.orders,
        revenue: a.revenue,
        avgRevenue: a.days > 0 ? Math.round(a.revenue / a.days) : 0,
      }))
      .sort((a, b) => a.dow - b.dow);

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
            eq(schema.orders.status, "completed"),
            ordersInVnRange(startDate, endDate),
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

    // ⚠️ Phải trả cả `amount`: trước đây chỉ có `value` (phần trăm ĐÃ làm tròn) nên
    // trang Báo cáo không cách nào hiện được số tiền, mà cộng các lát lại cũng không
    // chắc ra 100%. Giữ `value` để bản web cũ trong lúc deploy không vỡ biểu đồ.
    //
    // Chỉ có ở phần dữ liệu mới — bản xuất của POS cũ không ghi hình thức thanh toán.
    // Giao diện dựa vào `legacyDaysInRange` để ghi chú "chỉ tính từ …".
    //
    // Dùng innerJoin thay vì nạp hết id đơn rồi `inArray`: khoảng ngày dài sẽ đụng
    // trần 65535 tham số của Postgres.
    let paymentMethods: { name: string; value: number; amount: number; count: number }[] = [];
    if (hasLive) {
      const pmData = await db
        .select({
          method: schema.payments.method,
          total: sum(schema.payments.amount),
          count: count(),
        })
        .from(schema.payments)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.payments.order_id))
        .where(and(liveScope, eq(schema.payments.status, "completed")))
        .groupBy(schema.payments.method)
        .orderBy(desc(sum(schema.payments.amount)));

      const grandTotal = pmData.reduce((s, p) => s + Number(p.total || 0), 0);
      paymentMethods = pmData.map((p) => ({
        name: p.method,
        value: grandTotal > 0 ? Math.round((Number(p.total || 0) / grandTotal) * 100) : 0,
        amount: Number(p.total || 0),
        count: Number(p.count || 0),
      }));
    }

    return c.json({
      success: true,
      data: {
        ...totals,
        /** 'day' hoặc 'month' — khoảng dài thì `days[].date` là 'YYYY-MM'. */
        granularity,
        days: dailyData,
        weekday,
        paymentMethods,
        branches,
        /** Ngày đầu tiên có dữ liệu đầy đủ (thanh toán/ca/giờ). null = không có lịch sử. */
        liveDataFrom: cutover ? nextDay(cutover) : null,
        /** >0 nghĩa là khoảng đang chọn có lấn vào dữ liệu cũ → giao diện ghi chú. */
        legacyDaysInRange: Number(legacyTotals[0]?.days || 0),
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
    const { useAll, tenant, ordersCondition } = scope;

    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 50) : 10;

    // Cùng quy tắc chia nguồn như /sales — xem getLegacyCutover().
    const cutover = useAll ? null : await getLegacyCutover(tenant.branchId);
    const legacyEnd = cutover && startDate <= cutover ? (endDate < cutover ? endDate : cutover) : null;
    const liveStart = cutover ? (startDate > cutover ? startDate : nextDay(cutover)) : startDate;
    const hasLive = liveStart <= endDate;

    const [liveRows, legacyRows] = await Promise.all([
      hasLive
        ? db
            .select({
              name: schema.orderItems.name,
              quantity: sum(schema.orderItems.quantity),
              revenue: sum(schema.orderItems.total),
            })
            .from(schema.orderItems)
            // innerJoin thay cho `inArray(orderIds)`: khoảng dài sẽ đụng trần 65535
            // tham số của Postgres.
            .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.order_id))
            .where(
              and(
                ordersCondition,
                eq(schema.orders.status, "completed"),
                ordersInVnRange(liveStart, endDate),
              ),
            )
            .groupBy(schema.orderItems.name)
        : Promise.resolve([]),
      legacyEnd
        ? db
            .select({
              name: schema.salesHistoryItems.item_name,
              quantity: sum(schema.salesHistoryItems.quantity),
              revenue: sum(schema.salesHistoryItems.revenue),
            })
            .from(schema.salesHistoryItems)
            .where(
              and(
                eq(schema.salesHistoryItems.branch_id, tenant.branchId),
                gte(schema.salesHistoryItems.business_date, startDate),
                lte(schema.salesHistoryItems.business_date, legacyEnd),
                // POS cũ ghi tuỳ chọn ("Nhiều đường", "Ít đá"…) thành dòng món giá 0đ.
                // Hệ mới để chúng ở `order_item_modifiers` — bảng khác, không lọt vào
                // đây. Không loại ra thì "Nhiều đường" chen lên top món bán chạy.
                //
                // IS DISTINCT FROM chứ không phải `<>`: cột nullable, mà `NULL <> 'x'`
                // ra NULL nên món thiếu nhóm sẽ bị loại im lặng.
                sql`${schema.salesHistoryItems.group_name} IS DISTINCT FROM ${LEGACY_MODIFIER_GROUP}`,
              ),
            )
            .groupBy(schema.salesHistoryItems.item_name)
        : Promise.resolve([]),
    ]);

    // Gộp theo tên đã chuẩn hoá, nếu không cùng một món ra hai dòng (xem
    // LEGACY_ITEM_ALIASES). Xếp hạng và cắt `limit` SAU khi gộp — cắt trước rồi gộp
    // là hạng sai.
    const merged = new Map<string, { totalQuantity: number; totalRevenue: number }>();
    for (const row of [...legacyRows, ...liveRows]) {
      const key = canonicalItemName(row.name);
      const acc = merged.get(key) ?? { totalQuantity: 0, totalRevenue: 0 };
      acc.totalQuantity += Number(row.quantity || 0);
      acc.totalRevenue += Number(row.revenue || 0);
      merged.set(key, acc);
    }

    // Xếp theo DOANH THU, không theo số lượng: khi có cả lịch sử thì đơn vị lẫn lộn
    // (ly, túi, ký, và cả gram cà phê rời của hệ cũ) nên cộng/so số lượng là vô nghĩa
    // — 21.725 gram sẽ chen lên trên 8.335 ly. Danh sách vẫn hiện cả hai số.
    const data = [...merged.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    return c.json({ success: true, data });
  },
);

export { reports };
