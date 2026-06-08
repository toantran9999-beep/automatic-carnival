import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, sql, desc, inArray, count, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { reportQuerySchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { peruStartOfDay } from "../lib/timezone.js";
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
