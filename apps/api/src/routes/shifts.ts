import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, desc, sql, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { openShiftSchema, closeShiftSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { wsManager } from "../ws/manager.js";

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

/** Tổng tiền thu được (payments completed) của chi nhánh kể từ lúc mở ca. */
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

  const summary = await computeSummary(tenant.branchId, shift.opened_at);
  return c.json({
    success: true,
    data: {
      ...shift,
      summary: { ...summary, expectedCash: shift.opening_cash + summary.cashSales },
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

  const summary = await computeSummary(tenant.branchId, shift.opened_at);
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
    data: { ...closed, summary: { ...summary, expectedCash } },
  });
});

export { shifts };
