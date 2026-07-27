import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { createBranchSchema, updateBranchSchema, idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { t } from "../lib/i18n.js";
import { maskBranchSecrets, maskBranchList, mergeBranchSecrets } from "../lib/branch-secrets.js";

const branches = new Hono<AppEnv>();

branches.use("*", authMiddleware);
branches.use("*", tenantMiddleware);

// GET / - List branches for current org
branches.get("/", requirePermission("branch:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const result = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.organization_id, tenant.organizationId));

  return c.json({ success: true, data: maskBranchList(result) });
});

// POST / - Create branch
branches.post(
  "/",
  requirePermission("branch:create"),
  zValidator("json", createBranchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Check slug uniqueness within org
    const existing = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.organization_id, tenant.organizationId),
          eq(schema.branches.slug, body.slug),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return c.json(
        { success: false, error: { code: "CONFLICT", message: t(c, "branch_slug_exists") } },
        409,
      );
    }

    const [branch] = await db
      .insert(schema.branches)
      .values({
        organization_id: tenant.organizationId,
        name: body.name,
        slug: body.slug,
        address: body.address,
        phone: body.phone,
        timezone: body.timezone,
        currency: body.currency,
        tax_rate: body.taxRate,
        settings: body.settings,
      })
      .returning();

    return c.json({ success: true, data: maskBranchSecrets(branch) }, 201);
  },
);

// GET /:id
branches.get(
  "/:id",
  requirePermission("branch:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [branch] = await db
      .select()
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "branch_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: maskBranchSecrets(branch) });
  },
);

// PATCH /:id
branches.patch(
  "/:id",
  requirePermission("branch:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateBranchSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const updateData: Record<string, any> = { updated_at: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.taxRate !== undefined) updateData.tax_rate = body.taxRate;
    if (body.settings !== undefined) {
      // Client không bao giờ nhận được khóa bí mật (đã che ở GET), nên nó gửi lên
      // chuỗi rỗng. Ghi thẳng là xoá sổ khóa MoMo/SePay chỉ vì ai đó sửa số điện
      // thoại chi nhánh — phải ghép lại với giá trị đang lưu.
      const [existing] = await db
        .select({ settings: schema.branches.settings })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.id, id),
            eq(schema.branches.organization_id, tenant.organizationId),
          ),
        )
        .limit(1);
      updateData.settings = mergeBranchSecrets(body.settings, existing?.settings);
    }

    const [updated] = await db
      .update(schema.branches)
      .set(updateData)
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organization_id, tenant.organizationId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "branch_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: maskBranchSecrets(updated) });
  },
);

export { branches };
