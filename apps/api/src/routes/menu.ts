import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, inArray, asc, desc, gte, sum, isNotNull } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { peruStartOfDay } from "../lib/timezone.js";
import {
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  createModifierGroupSchema,
  createModifierSchema,
  updateModifierGroupSchema,
  updateModifierSchema,
  idParamSchema,
} from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { t } from "../lib/i18n.js";
import { wsManager } from "../ws/manager.js";

const menu = new Hono<AppEnv>();

/**
 * Số → chuỗi cho cột `numeric` của Postgres (Drizzle nhận chuỗi), giữ nguyên
 * null/undefined. Dùng cho khoảng hợp lệ của tùy chọn kiểu gõ số.
 */
function numOrNull(v: number | null | undefined): string | null {
  return v === null || v === undefined ? null : String(v);
}

menu.use("*", authMiddleware);
menu.use("*", tenantMiddleware);
menu.use("*", requireBranch);

/**
 * Sửa thực đơn xong thì báo cho mọi máy trong chi nhánh bỏ cache thực đơn ngay.
 *
 * Đặt ở MIDDLEWARE chứ không rải vào từng endpoint: route này có gần 20 lệnh
 * thêm/sửa/xoá (món, danh mục, nhóm tuỳ chọn, sắp thứ tự…) — rải tay thì sớm muộn
 * cũng sót một chỗ, và chỗ sót đó chính là chỗ máy POS bán nhầm giá cũ.
 */
menu.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.res.status >= 400) return;
  const tenant = c.get("tenant") as any;
  if (!tenant?.branchId) return;
  await wsManager.publish(`branch:${tenant.branchId}`, {
    type: "menu:updated",
    payload: { source: "menu" },
    timestamp: Date.now(),
  });
});

// --- Categories ---

// GET /categories
menu.get("/categories", requirePermission("menu:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  // Thứ tự hiển thị do chủ quán tự sắp (sort_order); cùng sort_order thì theo tên
  // để danh sách ổn định, không nhảy lung tung theo thứ tự vật lý của Postgres.
  const categories = await db
    .select()
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.branch_id, tenant.branchId),
        eq(schema.menuCategories.organization_id, tenant.organizationId),
      ),
    )
    .orderBy(asc(schema.menuCategories.sort_order), asc(schema.menuCategories.name));

  return c.json({ success: true, data: categories });
});

// POST /categories
menu.post(
  "/categories",
  requirePermission("menu:create"),
  zValidator("json", createCategorySchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [category] = await db
      .insert(schema.menuCategories)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        name: body.name,
        description: body.description,
        image_url: body.imageUrl,
        sort_order: body.sortOrder,
        is_active: body.isActive,
      })
      .returning();

    return c.json({ success: true, data: category }, 201);
  },
);

// PATCH /categories/:id
menu.patch(
  "/categories/:id",
  requirePermission("menu:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateCategorySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const [updated] = await db
      .update(schema.menuCategories)
      .set(updateData)
      .where(
        and(
          eq(schema.menuCategories.id, id),
          eq(schema.menuCategories.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "menu_category_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// DELETE /categories/:id
menu.delete(
  "/categories/:id",
  requirePermission("menu:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [deleted] = await db
      .delete(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.id, id),
          eq(schema.menuCategories.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "menu_category_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: { message: t(c, "menu_category_deleted") } });
  },
);

// --- Items ---

// GET /items
menu.get("/items", requirePermission("menu:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const categoryId = c.req.query("categoryId");

  const conditions = [
    eq(schema.menuItems.branch_id, tenant.branchId),
    eq(schema.menuItems.organization_id, tenant.organizationId),
  ];

  if (categoryId) {
    conditions.push(eq(schema.menuItems.category_id, categoryId));
  }

  const items = await db
    .select()
    .from(schema.menuItems)
    .where(and(...conditions))
    .orderBy(asc(schema.menuItems.sort_order), asc(schema.menuItems.name));

  return c.json({ success: true, data: items });
});

/**
 * GET /best-sellers - Top món bán chạy của chi nhánh, dùng cho nhóm "Bán chạy" trên POS.
 *
 * Gác `menu:read` (thu ngân/phục vụ CÓ quyền này, KHÔNG có `reports:read`) nên không
 * dùng lại được /api/reports/top-items. Gom theo `menu_item_id` (không phải theo tên
 * như báo cáo) vì POS cần đúng id để bấm là thêm vào giỏ; bỏ món nhập tay (id null).
 * Số món & số ngày lấy từ cài đặt chi nhánh; tắt cài đặt thì trả rỗng ngay tại server.
 */
menu.get("/best-sellers", requirePermission("menu:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const [branch] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId))
    .limit(1);
  const s = (branch?.settings as Record<string, any>) || {};

  // Chưa có khóa = BẬT (tính năng mặc định bật sẵn)
  if (s.show_best_sellers === false) {
    return c.json({ success: true, data: [] });
  }

  const days = Math.min(Math.max(Number(s.best_sellers_days ?? 30) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(s.best_sellers_limit ?? 10) || 10, 3), 30);
  const since = new Date(peruStartOfDay().getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      menuItemId: schema.orderItems.menu_item_id,
      quantity: sum(schema.orderItems.quantity),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.order_id, schema.orders.id))
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        eq(schema.orders.status, "completed"),
        gte(schema.orders.created_at, since),
        isNotNull(schema.orderItems.menu_item_id),
      ),
    )
    .groupBy(schema.orderItems.menu_item_id)
    .orderBy(desc(sum(schema.orderItems.quantity)))
    .limit(limit);

  return c.json({
    success: true,
    data: rows.map((r) => ({ menuItemId: r.menuItemId, quantity: Number(r.quantity || 0) })),
  });
});

// POST /items
menu.post(
  "/items",
  requirePermission("menu:create"),
  zValidator("json", createMenuItemSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [category] = await db
      .select({ id: schema.menuCategories.id })
      .from(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.id, body.categoryId),
          eq(schema.menuCategories.branch_id, tenant.branchId),
          eq(schema.menuCategories.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!category) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "menu_category_not_found") } },
        404,
      );
    }

    const [item] = await db
      .insert(schema.menuItems)
      .values({
        category_id: body.categoryId,
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        name: body.name,
        description: body.description,
        price: body.price,
        image_url: body.imageUrl,
        is_available: body.isAvailable,
        sort_order: body.sortOrder,
        preparation_time_min: body.preparationTimeMin,
        unit: body.unit,
      })
      .returning();

    return c.json({ success: true, data: item }, 201);
  },
);

// PATCH /items/:id
menu.patch(
  "/items/:id",
  requirePermission("menu:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateMenuItemSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const updateData: Record<string, any> = {};
    if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;
    if (body.isAvailable !== undefined) updateData.is_available = body.isAvailable;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.preparationTimeMin !== undefined) updateData.preparation_time_min = body.preparationTimeMin;
    if (body.unit !== undefined) updateData.unit = body.unit;

    const [updated] = await db
      .update(schema.menuItems)
      .set(updateData)
      .where(
        and(
          eq(schema.menuItems.id, id),
          eq(schema.menuItems.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// DELETE /items/:id
menu.delete(
  "/items/:id",
  requirePermission("menu:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      const [deleted] = await db
        .delete(schema.menuItems)
        .where(
          and(
            eq(schema.menuItems.id, id),
            eq(schema.menuItems.branch_id, tenant.branchId),
          ),
        )
        .returning();

      if (!deleted) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
          404,
        );
      }

      return c.json({ success: true, data: { message: t(c, "menu_item_deleted") } });
    } catch (err: any) {
      // Món đã có đơn hàng tham chiếu (FK restrict) -> không xóa được, ẩn khỏi thực đơn thay thế.
      // drizzle-orm bọc lỗi Postgres gốc vào DrizzleQueryError, mã lỗi nằm ở err.cause.code.
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23503") {
        const [hidden] = await db
          .update(schema.menuItems)
          .set({ is_available: false })
          .where(
            and(
              eq(schema.menuItems.id, id),
              eq(schema.menuItems.branch_id, tenant.branchId),
            ),
          )
          .returning();

        if (!hidden) {
          return c.json(
            { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
            404,
          );
        }

        return c.json({
          success: true,
          data: { message: t(c, "menu_item_hidden_has_orders"), hidden: true },
        });
      }
      throw err;
    }
  },
);

// --- Modifier Groups ---

// POST /modifier-groups
menu.post(
  "/modifier-groups",
  requirePermission("menu:create"),
  zValidator("json", createModifierGroupSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Tự gán thứ tự = cuối danh sách nếu không truyền sortOrder
    let sortOrder = body.sortOrder;
    if (sortOrder === undefined) {
      const [last] = await db
        .select({ sort_order: schema.modifierGroups.sort_order })
        .from(schema.modifierGroups)
        .where(eq(schema.modifierGroups.branch_id, tenant.branchId))
        .orderBy(desc(schema.modifierGroups.sort_order))
        .limit(1);
      sortOrder = (last?.sort_order ?? -1) + 1;
    }

    const [group] = await db
      .insert(schema.modifierGroups)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        name: body.name,
        min_selections: body.minSelections,
        max_selections: body.maxSelections,
        is_required: body.isRequired,
        sort_order: sortOrder,
      })
      .returning();

    return c.json({ success: true, data: group }, 201);
  },
);

// --- Modifiers ---

// POST /modifiers
menu.post(
  "/modifiers",
  requirePermission("menu:create"),
  zValidator("json", createModifierSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [group] = await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, body.groupId),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!group) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_group_not_found") } },
        404,
      );
    }

    const [modifier] = await db
      .insert(schema.modifiers)
      .values({
        group_id: body.groupId,
        name: body.name,
        price: body.price,
        is_available: body.isAvailable,
        sort_order: body.sortOrder ?? 0,
        // Tùy chọn kiểu gõ số. `numOrNull` vì cột là numeric — Drizzle nhận chuỗi.
        input_type: body.inputType,
        unit: body.unit ?? null,
        min_value: numOrNull(body.minValue),
        max_value: numOrNull(body.maxValue),
        default_value: numOrNull(body.defaultValue),
      })
      .returning();

    return c.json({ success: true, data: modifier }, 201);
  },
);

// POST /items/:id/modifier-groups - Link modifier group to item
menu.post(
  "/items/:id/modifier-groups",
  requirePermission("menu:update"),
  zValidator("param", idParamSchema),
  zValidator("json", z.object({ groupId: z.string().uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const { groupId } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, id),
          eq(schema.menuItems.branch_id, tenant.branchId),
          eq(schema.menuItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    const [group] = await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, groupId),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item || !group) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_or_group_not_found") } },
        404,
      );
    }

    await db
      .insert(schema.menuItemModifierGroups)
      .values({ item_id: id, group_id: groupId })
      .onConflictDoNothing();

    return c.json({ success: true, data: { message: t(c, "modifier_group_linked") } }, 201);
  },
);

// GET /modifier-groups
menu.get("/modifier-groups", requirePermission("menu:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const groups = await db
    .select()
    .from(schema.modifierGroups)
    .where(
      and(
        eq(schema.modifierGroups.branch_id, tenant.branchId),
        eq(schema.modifierGroups.organization_id, tenant.organizationId),
      ),
    )
    .orderBy(asc(schema.modifierGroups.sort_order), asc(schema.modifierGroups.name));

  // Fetch modifiers for each group
  const groupIds = groups.map((g) => g.id);
  let allModifiers: any[] = [];
  if (groupIds.length > 0) {
    allModifiers = await db
      .select()
      .from(schema.modifiers)
      .where(
        groupIds.length === 1
          ? eq(schema.modifiers.group_id, groupIds[0])
          : inArray(schema.modifiers.group_id, groupIds)
      )
      .orderBy(asc(schema.modifiers.sort_order), asc(schema.modifiers.name));
  }

  const result = groups.map((g) => ({
    ...g,
    modifiers: allModifiers.filter((m) => m.group_id === g.id),
  }));

  return c.json({ success: true, data: result });
});

// PATCH /modifier-groups/:id
menu.patch(
  "/modifier-groups/:id",
  requirePermission("menu:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateModifierGroupSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.minSelections !== undefined) updateData.min_selections = body.minSelections;
    if (body.maxSelections !== undefined) updateData.max_selections = body.maxSelections;
    if (body.isRequired !== undefined) updateData.is_required = body.isRequired;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;

    const [updated] = await db
      .update(schema.modifierGroups)
      .set(updateData)
      .where(
        and(
          eq(schema.modifierGroups.id, id),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_group_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// DELETE /modifier-groups/:id
menu.delete(
  "/modifier-groups/:id",
  requirePermission("menu:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [deleted] = await db
      .delete(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, id),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_group_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: { message: t(c, "modifier_group_deleted") } });
  },
);

// PATCH /modifiers/:id
menu.patch(
  "/modifiers/:id",
  requirePermission("menu:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateModifierSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [existingModifier] = await db
      .select({
        id: schema.modifiers.id,
      })
      .from(schema.modifiers)
      .innerJoin(
        schema.modifierGroups,
        eq(schema.modifiers.group_id, schema.modifierGroups.id),
      )
      .where(
        and(
          eq(schema.modifiers.id, id),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!existingModifier) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
        404,
      );
    }

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.isAvailable !== undefined) updateData.is_available = body.isAvailable;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    // ⚠️ Quên thêm vào danh sách trắng này là PATCH im lặng không lưu.
    if (body.inputType !== undefined) updateData.input_type = body.inputType;
    if (body.unit !== undefined) updateData.unit = body.unit ?? null;
    if (body.minValue !== undefined) updateData.min_value = numOrNull(body.minValue);
    if (body.maxValue !== undefined) updateData.max_value = numOrNull(body.maxValue);
    if (body.defaultValue !== undefined) updateData.default_value = numOrNull(body.defaultValue);

    const [updated] = await db
      .update(schema.modifiers)
      .set(updateData)
      .where(eq(schema.modifiers.id, id))
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

// DELETE /modifiers/:id
menu.delete(
  "/modifiers/:id",
  requirePermission("menu:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [existingModifier] = await db
      .select({
        id: schema.modifiers.id,
      })
      .from(schema.modifiers)
      .innerJoin(
        schema.modifierGroups,
        eq(schema.modifiers.group_id, schema.modifierGroups.id),
      )
      .where(
        and(
          eq(schema.modifiers.id, id),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!existingModifier) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
        404,
      );
    }

    const [deleted] = await db
      .delete(schema.modifiers)
      .where(eq(schema.modifiers.id, id))
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: { message: t(c, "modifier_deleted") } });
  },
);

// GET /items/:id/modifier-groups
menu.get(
  "/items/:id/modifier-groups",
  requirePermission("menu:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, id),
          eq(schema.menuItems.branch_id, tenant.branchId),
          eq(schema.menuItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    const links = await db
      .select()
      .from(schema.menuItemModifierGroups)
      .where(eq(schema.menuItemModifierGroups.item_id, id));

    if (links.length === 0) {
      return c.json({ success: true, data: [] });
    }

    const groupIds = links.map((l) => l.group_id);
    const groups = await db
      .select()
      .from(schema.modifierGroups)
      .where(
        and(
          groupIds.length === 1
            ? eq(schema.modifierGroups.id, groupIds[0])
            : inArray(schema.modifierGroups.id, groupIds),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        )
      )
      .orderBy(asc(schema.modifierGroups.sort_order), asc(schema.modifierGroups.name));

    // Also fetch modifiers for these groups
    let allModifiers: any[] = [];
    if (groupIds.length > 0) {
      allModifiers = await db
        .select()
        .from(schema.modifiers)
        .where(
          groupIds.length === 1
            ? eq(schema.modifiers.group_id, groupIds[0])
            : inArray(schema.modifiers.group_id, groupIds)
        )
        .orderBy(asc(schema.modifiers.sort_order), asc(schema.modifiers.name));
    }

    const result = groups.map((g) => ({
      ...g,
      modifiers: allModifiers.filter((m) => m.group_id === g.id),
    }));

    return c.json({ success: true, data: result });
  },
);

// DELETE /items/:id/modifier-groups/:groupId
menu.delete(
  "/items/:id/modifier-groups/:groupId",
  requirePermission("menu:update"),
  async (c) => {
    const itemId = c.req.param("id");
    const groupId = c.req.param("groupId");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, itemId),
          eq(schema.menuItems.branch_id, tenant.branchId),
          eq(schema.menuItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    const [group] = await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, groupId),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
          eq(schema.modifierGroups.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item || !group) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_or_group_not_found") } },
        404,
      );
    }

    const [deleted] = await db
      .delete(schema.menuItemModifierGroups)
      .where(
        and(
          eq(schema.menuItemModifierGroups.item_id, itemId),
          eq(schema.menuItemModifierGroups.group_id, groupId),
        ),
      )
      .returning();

    if (!deleted) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "link_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: { message: t(c, "modifier_group_unlinked") } });
  },
);

export { menu };
