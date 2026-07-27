import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@restai/db";
import { eq } from "drizzle-orm";
import { updateOrgSettingsSchema, updateBranchSettingsSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";
import { maskBranchSecrets, mergeBranchSecrets } from "../lib/branch-secrets.js";

const settings = new Hono<AppEnv>();
settings.use("*", authMiddleware, tenantMiddleware);

// GET /org
settings.get("/org", async (c) => {
  const tenant = c.get("tenant") as any;
  const [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, tenant.organizationId));
  if (!org) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: t(c, "org_not_found") } }, 404);
  }
  return c.json({ success: true, data: org });
});

// PATCH /org
settings.patch("/org", requirePermission("org:update"), zValidator("json", updateOrgSettingsSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const body = c.req.valid("json");

  const updateData: any = { updated_at: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.logoUrl !== undefined) updateData.logo_url = body.logoUrl;
  if (body.settings !== undefined) updateData.settings = body.settings;

  const [updated] = await db.update(schema.organizations)
    .set(updateData)
    .where(eq(schema.organizations.id, tenant.organizationId))
    .returning();
  return c.json({ success: true, data: updated });
});

// GET /branch
settings.get("/branch", async (c) => {
  const tenant = c.get("tenant") as any;
  if (!tenant.branchId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: t(c, "branch_header_required") } }, 400);
  }
  const [branch] = await db.select().from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId));
  if (!branch) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: t(c, "branch_not_found") } }, 404);
  }
  return c.json({ success: true, data: maskBranchSecrets(branch) });
});

// PATCH /branch — settings:update để branch_manager (Quản lý) cũng chỉnh được cài đặt chi nhánh
settings.patch("/branch", requirePermission("settings:update"), zValidator("json", updateBranchSettingsSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  if (!tenant.branchId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: t(c, "branch_header_required") } }, 400);
  }
  const body = c.req.valid("json");
  const updateData: any = { updated_at: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.taxRate !== undefined) updateData.tax_rate = body.taxRate;
  if (body.timezone !== undefined) updateData.timezone = body.timezone;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.settings !== undefined) {
    // Ô khóa để trống = giữ nguyên khóa đang lưu (xem branch-secrets.ts).
    const [existing] = await db.select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    updateData.settings = mergeBranchSecrets(body.settings, existing?.settings);
  }

  if (
    body.inventoryEnabled !== undefined ||
    body.waiterTableAssignmentEnabled !== undefined ||
    body.printMode !== undefined ||
    body.printDriver !== undefined ||
    body.hidePosNav !== undefined ||
    body.hideTableQr !== undefined ||
    body.receipt !== undefined ||
    body.showBestSellers !== undefined ||
    body.bestSellersLimit !== undefined ||
    body.bestSellersDays !== undefined ||
    body.autoPrintReceiptOnPaid !== undefined
  ) {
    // Fetch current settings to merge
    const [existing] = await db.select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    // Nếu nhánh trên đã ghép settings thì lấy bản đó làm gốc, kẻo ghi đè mất.
    const currentSettings =
      (updateData.settings as Record<string, unknown>) ||
      (existing?.settings as Record<string, unknown>) ||
      {};
    const merged = { ...currentSettings };
    if (body.inventoryEnabled !== undefined) merged.inventory_enabled = body.inventoryEnabled;
    if (body.waiterTableAssignmentEnabled !== undefined) merged.waiter_table_assignment_enabled = body.waiterTableAssignmentEnabled;
    if (body.printMode !== undefined) merged.print_mode = body.printMode;
    if (body.printDriver !== undefined) merged.print_driver = body.printDriver;
    if (body.hidePosNav !== undefined) merged.hide_pos_nav = body.hidePosNav;
    if (body.hideTableQr !== undefined) merged.hide_table_qr = body.hideTableQr;
    if (body.receipt !== undefined) merged.receipt = body.receipt;
    if (body.showBestSellers !== undefined) merged.show_best_sellers = body.showBestSellers;
    if (body.bestSellersLimit !== undefined) merged.best_sellers_limit = body.bestSellersLimit;
    if (body.bestSellersDays !== undefined) merged.best_sellers_days = body.bestSellersDays;
    if (body.autoPrintReceiptOnPaid !== undefined) merged.auto_print_receipt_on_paid = body.autoPrintReceiptOnPaid;
    updateData.settings = merged;
  }

  const [updated] = await db.update(schema.branches)
    .set(updateData)
    .where(eq(schema.branches.id, tenant.branchId))
    .returning();

  // Báo mọi máy trong chi nhánh bỏ cache cài đặt ngay (VD: bật/tắt nhóm "Bán chạy",
  // đổi mẫu hóa đơn) thay vì đợi hết hạn cache.
  await wsManager.publish(`branch:${tenant.branchId}`, {
    type: "menu:updated",
    payload: { source: "settings" },
    timestamp: Date.now(),
  });

  return c.json({ success: true, data: maskBranchSecrets(updated) });
});

export { settings };
