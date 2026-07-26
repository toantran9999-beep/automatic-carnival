import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lt, desc, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@restai/db";
import { openShiftSchema, closeShiftSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { wsManager } from "../ws/manager.js";
import { peruStartOfDay } from "../lib/timezone.js";

const shifts = new Hono<AppEnv>();

shifts.use("*", authMiddleware);
shifts.use("*", tenantMiddleware);
shifts.use("*", requireBranch);

interface ShiftSummary {
  cashSales: number;
  totalSales: number;
  orderCount: number;
  byMethod: Record<string, number>;
}

/**
 * Tổng tiền thu được (payments completed) của chi nhánh kể từ lúc mở ca — dùng để đối
 * soát tiền mặt (expectedCash/chênh lệch) nên PHẢI theo đúng khoảng thời gian ca đang mở,
 * không tính gộp ca trước đó (nếu có nhiều ca trong 1 ngày, tiền mặt ca trước đã chốt riêng).
 */
async function computeSummary(branchId: string, openedAt: Date): Promise<ShiftSummary> {
  const rows = await db
    .select({
      method: schema.payments.method,
      total: sum(schema.payments.amount),
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.branch_id, branchId),
        eq(schema.payments.status, "completed"),
        gte(schema.payments.created_at, openedAt),
      ),
    )
    .groupBy(schema.payments.method);

  const byMethod: Record<string, number> = {};
  let totalSales = 0;
  for (const r of rows) {
    const amt = Number(r.total || 0);
    byMethod[r.method] = amt;
    totalSales += amt;
  }

  const [oc] = await db
    .select({ c: sql<number>`count(distinct ${schema.payments.order_id})::int` })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.branch_id, branchId),
        eq(schema.payments.status, "completed"),
        gte(schema.payments.created_at, openedAt),
      ),
    );

  return {
    cashSales: byMethod["cash"] || 0,
    totalSales,
    orderCount: Number(oc?.c || 0),
    byMethod,
  };
}

/**
 * Báo cáo tổng quan CẢ NGÀY (0h giờ VN chứa `openedAt`) — dựa trên đơn hàng (orders),
 * không chỉ ca hiện tại. Dùng để hiển thị khi đóng ca + lưu vào thống kê hàng ngày,
 * KHÔNG dùng để đối soát tiền mặt (việc đó vẫn theo đúng khoảng thời gian ca).
 */
async function computeDaySummary(branchId: string, openedAt: Date) {
  const dayStart = peruStartOfDay(openedAt);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [orderStats] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      totalRevenue: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branch_id, branchId),
        eq(schema.orders.status, "completed"),
        gte(schema.orders.created_at, dayStart),
        lt(schema.orders.created_at, dayEnd),
      ),
    );

  const cancelledRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branch_id, branchId),
        eq(schema.orders.status, "cancelled"),
        gte(schema.orders.created_at, dayStart),
        lt(schema.orders.created_at, dayEnd),
      ),
    );

  return {
    dayStart: dayStart.toISOString(),
    totalOrders: Number(orderStats?.totalOrders || 0),
    totalRevenue: Number(orderStats?.totalRevenue || 0),
    cancelledOrders: Number(cancelledRows[0]?.c || 0),
  };
}

async function getOpenShift(branchId: string) {
  const [shift] = await db
    .select()
    .from(schema.registerShifts)
    .where(
      and(
        eq(schema.registerShifts.branch_id, branchId),
        eq(schema.registerShifts.status, "open"),
      ),
    )
    .orderBy(desc(schema.registerShifts.opened_at))
    .limit(1);
  return shift || null;
}

// GET /current - ca đang mở (kèm tổng kết trực tiếp) hoặc null
shifts.get("/current", requirePermission("shifts:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const shift = await getOpenShift(tenant.branchId);
  if (!shift) return c.json({ success: true, data: null });

  // Tên người mở ca = "thu ngân trực ca", dùng in lên phiếu đặt món (xem print-ticket).
  const [[opener], summary, daySummary] = await Promise.all([
    db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, shift.opened_by))
      .limit(1),
    computeSummary(tenant.branchId, shift.opened_at),
    computeDaySummary(tenant.branchId, shift.opened_at),
  ]);

  return c.json({
    success: true,
    data: {
      ...shift,
      opened_by_name: opener?.name ?? null,
      summary: { ...summary, expectedCash: shift.opening_cash + summary.cashSales },
      daySummary,
    },
  });
});

// POST /open - mở ca mới (chỉ 1 ca mở/chi nhánh)
shifts.post("/open", requirePermission("shifts:manage"), zValidator("json", openShiftSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const user = c.get("user") as any;
  const body = c.req.valid("json");

  const existing = await getOpenShift(tenant.branchId);
  if (existing) {
    return c.json(
      { success: false, error: { code: "SHIFT_ALREADY_OPEN", message: "Đã có ca đang mở" } },
      409,
    );
  }

  let created;
  try {
    [created] = await db
      .insert(schema.registerShifts)
      .values({
        organization_id: tenant.organizationId,
        branch_id: tenant.branchId,
        status: "open",
        opened_by: user.sub,
        opening_cash: body.openingCash,
        note: body.note || null,
      })
      .returning();
  } catch {
    // Unique index (1 ca mở/chi nhánh) chặn đua mở 2 ca cùng lúc.
    return c.json(
      { success: false, error: { code: "SHIFT_ALREADY_OPEN", message: "Đã có ca đang mở" } },
      409,
    );
  }

  await wsManager.publish(`branch:${tenant.branchId}`, {
    type: "shift:opened",
    payload: { shiftId: created.id },
    timestamp: Date.now(),
  });

  return c.json({ success: true, data: created }, 201);
});

// POST /close - đóng ca đang mở, tính tiền & chênh lệch
shifts.post("/close", requirePermission("shifts:manage"), zValidator("json", closeShiftSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const user = c.get("user") as any;
  const body = c.req.valid("json");

  const shift = await getOpenShift(tenant.branchId);
  if (!shift) {
    return c.json(
      { success: false, error: { code: "NO_OPEN_SHIFT", message: "Không có ca nào đang mở" } },
      400,
    );
  }

  const [summary, daySummary] = await Promise.all([
    computeSummary(tenant.branchId, shift.opened_at),
    computeDaySummary(tenant.branchId, shift.opened_at),
  ]);
  const expectedCash = shift.opening_cash + summary.cashSales;
  const now = new Date();

  const [closed] = await db
    .update(schema.registerShifts)
    .set({
      status: "closed",
      closed_by: user.sub,
      closed_at: now,
      closing_cash: body.closingCash,
      expected_cash: expectedCash,
      cash_difference: body.closingCash - expectedCash,
      cash_sales: summary.cashSales,
      total_sales: summary.totalSales,
      order_count: summary.orderCount,
      sales_by_method: summary.byMethod,
      day_summary: daySummary,
      note: body.note ?? shift.note,
      updated_at: now,
    })
    .where(eq(schema.registerShifts.id, shift.id))
    .returning();

  await wsManager.publish(`branch:${tenant.branchId}`, {
    type: "shift:closed",
    payload: { shiftId: closed.id },
    timestamp: Date.now(),
  });

  return c.json({
    success: true,
    data: { ...closed, summary: { ...summary, expectedCash }, daySummary },
  });
});

// GET /history - Lịch sử các ca đã đóng (thống kê hàng ngày, mới nhất trước)
shifts.get(
  "/history",
  requirePermission("shifts:read"),
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  ),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { limit } = c.req.valid("query");

    const opener = alias(schema.users, "opener");
    const closer = alias(schema.users, "closer");

    const rows = await db
      .select({
        id: schema.registerShifts.id,
        opened_at: schema.registerShifts.opened_at,
        closed_at: schema.registerShifts.closed_at,
        opening_cash: schema.registerShifts.opening_cash,
        closing_cash: schema.registerShifts.closing_cash,
        expected_cash: schema.registerShifts.expected_cash,
        cash_difference: schema.registerShifts.cash_difference,
        cash_sales: schema.registerShifts.cash_sales,
        total_sales: schema.registerShifts.total_sales,
        order_count: schema.registerShifts.order_count,
        sales_by_method: schema.registerShifts.sales_by_method,
        day_summary: schema.registerShifts.day_summary,
        note: schema.registerShifts.note,
        opened_by_name: opener.name,
        closed_by_name: closer.name,
      })
      .from(schema.registerShifts)
      .leftJoin(opener, eq(opener.id, schema.registerShifts.opened_by))
      .leftJoin(closer, eq(closer.id, schema.registerShifts.closed_by))
      .where(
        and(
          eq(schema.registerShifts.branch_id, tenant.branchId),
          eq(schema.registerShifts.status, "closed"),
        ),
      )
      .orderBy(desc(schema.registerShifts.closed_at))
      .limit(limit);

    return c.json({ success: true, data: rows });
  },
);

export { shifts };
