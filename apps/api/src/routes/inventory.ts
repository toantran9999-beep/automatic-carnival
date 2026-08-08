import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, lt, sql, inArray, or } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  createInventoryItemSchema,
  createInventoryMovementSchema,
  createStockReceiptSchema,
  createStockIssueSchema,
  idParamSchema,
  movementQuerySchema,
} from "@restai/validators";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import {
  recordMovement,
  movementSign,
  InventoryItemNotFoundError,
} from "../services/inventory.service.js";
import { t } from "../lib/i18n.js";

const inventory = new Hono<AppEnv>();

inventory.use("*", authMiddleware);
inventory.use("*", tenantMiddleware);
inventory.use("*", requireBranch);

// --- Alerts ---

// GET /alerts - Items where current_stock < min_stock
inventory.get("/alerts", requirePermission("inventory:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const result = await db
    .select({
      id: schema.inventoryItems.id,
      name: schema.inventoryItems.name,
      unit: schema.inventoryItems.unit,
      current_stock: schema.inventoryItems.current_stock,
      min_stock: schema.inventoryItems.min_stock,
      cost_per_unit: schema.inventoryItems.cost_per_unit,
    })
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.branch_id, tenant.branchId),
        eq(schema.inventoryItems.organization_id, tenant.organizationId),
        sql`${schema.inventoryItems.current_stock}::numeric < ${schema.inventoryItems.min_stock}::numeric`,
      ),
    );

  return c.json({ success: true, data: result });
});

// --- Recipes ---

/**
 * GET /recipes - Mọi món trên thực đơn kèm số nguyên liệu đã cấu hình.
 *
 * Có endpoint này thì trang Định lượng mới bỏ được ô "dán UUID món ăn" — nhân viên
 * chọn món từ danh sách, và nhìn là biết còn bao nhiêu món chưa có công thức.
 */
inventory.get("/recipes", requirePermission("inventory:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const rows = await db
    .select({
      menu_item_id: schema.menuItems.id,
      name: schema.menuItems.name,
      category_id: schema.menuItems.category_id,
      category_name: schema.menuCategories.name,
      sort_order: schema.menuItems.sort_order,
      is_available: schema.menuItems.is_available,
      ingredient_count: sql<number>`count(${schema.recipeIngredients.inventory_item_id})::int`,
    })
    .from(schema.menuItems)
    .innerJoin(
      schema.menuCategories,
      eq(schema.menuItems.category_id, schema.menuCategories.id),
    )
    .leftJoin(
      schema.recipeIngredients,
      eq(schema.recipeIngredients.menu_item_id, schema.menuItems.id),
    )
    .where(
      and(
        eq(schema.menuItems.branch_id, tenant.branchId),
        eq(schema.menuItems.organization_id, tenant.organizationId),
      ),
    )
    .groupBy(
      schema.menuItems.id,
      schema.menuCategories.name,
      schema.menuCategories.sort_order,
    )
    .orderBy(schema.menuCategories.sort_order, schema.menuItems.sort_order);

  return c.json({
    success: true,
    data: {
      items: rows,
      configured: rows.filter((r) => r.ingredient_count > 0).length,
      total: rows.length,
    },
  });
});

// POST /recipes - Create/update recipe for a menu item
inventory.post(
  "/recipes",
  requirePermission("inventory:create"),
  zValidator(
    "json",
    z.object({
      menuItemId: z.string().uuid(),
      ingredients: z.array(
        z.object({
          inventoryItemId: z.string().uuid(),
          quantityUsed: z.number().positive(),
        }),
      ).min(1),
      /**
       * Phần chênh khi khách chọn tùy chọn. `replacesItemId` = phép THAY nguyên liệu
       * (đổi loại hạt), giữ nguyên lượng — khác hẳn cộng/trừ.
       */
      modifierIngredients: z
        .array(
          z.object({
            modifierId: z.string().uuid(),
            inventoryItemId: z.string().uuid(),
            quantityDelta: z.number(),
            replacesItemId: z.string().uuid().optional().nullable(),
          }),
        )
        .optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [menuItem] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, body.menuItemId),
          eq(schema.menuItems.branch_id, tenant.branchId),
          eq(schema.menuItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!menuItem) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    const modLines = body.modifierIngredients ?? [];

    // Mọi nguyên liệu được nhắc tới, kể cả vế "bị thay" của phép đổi hạt.
    const inventoryItemIds = [
      ...new Set([
        ...body.ingredients.map((ing) => ing.inventoryItemId),
        ...modLines.map((m) => m.inventoryItemId),
        ...modLines.flatMap((m) => (m.replacesItemId ? [m.replacesItemId] : [])),
      ]),
    ];

    const inventoryItems = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          inArray(schema.inventoryItems.id, inventoryItemIds),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      );

    if (inventoryItems.length !== inventoryItemIds.length) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: t(c, "ingredients_branch_mismatch") },
        },
        400,
      );
    }

    // Tùy chọn cũng phải thuộc chi nhánh này — modifiers không có branch_id nên phải
    // đi vòng qua modifier_groups.
    const modifierIds = [...new Set(modLines.map((m) => m.modifierId))];
    if (modifierIds.length > 0) {
      const owned = await db
        .select({ id: schema.modifiers.id })
        .from(schema.modifiers)
        .innerJoin(
          schema.modifierGroups,
          eq(schema.modifiers.group_id, schema.modifierGroups.id),
        )
        .where(
          and(
            inArray(schema.modifiers.id, modifierIds),
            eq(schema.modifierGroups.branch_id, tenant.branchId),
            eq(schema.modifierGroups.organization_id, tenant.organizationId),
          ),
        );

      if (owned.length !== modifierIds.length) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
          404,
        );
      }
    }

    // Một transaction cho cả công thức nền lẫn phần chênh: xoá xong mà ghi lại hỏng
    // giữa chừng là món đó mất trắng công thức, kho ngừng trừ mà không ai biết.
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.menu_item_id, body.menuItemId));

      const inserted = await tx
        .insert(schema.recipeIngredients)
        .values(
          body.ingredients.map((ing) => ({
            menu_item_id: body.menuItemId,
            inventory_item_id: ing.inventoryItemId,
            quantity_used: String(ing.quantityUsed),
          })),
        )
        .returning();

      if (modifierIds.length > 0) {
        await tx
          .delete(schema.modifierIngredients)
          .where(inArray(schema.modifierIngredients.modifier_id, modifierIds));

        if (modLines.length > 0) {
          await tx.insert(schema.modifierIngredients).values(
            modLines.map((m) => ({
              modifier_id: m.modifierId,
              inventory_item_id: m.inventoryItemId,
              quantity_delta: String(m.quantityDelta),
              replaces_item_id: m.replacesItemId ?? null,
            })),
          );
        }
      }

      return inserted;
    });

    return c.json({ success: true, data: result }, 201);
  },
);

// GET /recipes/:menuItemId - Get recipe ingredients for a menu item
inventory.get(
  "/recipes/:menuItemId",
  requirePermission("inventory:read"),
  zValidator("param", z.object({ menuItemId: z.string().uuid() })),
  async (c) => {
    const { menuItemId } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [menuItem] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, menuItemId),
          eq(schema.menuItems.branch_id, tenant.branchId),
          eq(schema.menuItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!menuItem) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    const ingredients = await db
      .select({
        menu_item_id: schema.recipeIngredients.menu_item_id,
        inventory_item_id: schema.recipeIngredients.inventory_item_id,
        quantity_used: schema.recipeIngredients.quantity_used,
        item_name: schema.inventoryItems.name,
        item_unit: schema.inventoryItems.unit,
        current_stock: schema.inventoryItems.current_stock,
      })
      .from(schema.recipeIngredients)
      .innerJoin(
        schema.inventoryItems,
        eq(schema.recipeIngredients.inventory_item_id, schema.inventoryItems.id),
      )
      .where(
        and(
          eq(schema.recipeIngredients.menu_item_id, menuItemId),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      );

    // Các tùy chọn của món này + phần chênh đã cấu hình. Trả cùng một lần gọi để hộp
    // thoại Công thức không phải ghép từ ba nơi.
    const modifiers = await db
      .select({
        modifier_id: schema.modifiers.id,
        modifier_name: schema.modifiers.name,
        group_id: schema.modifierGroups.id,
        group_name: schema.modifierGroups.name,
        group_sort: schema.modifierGroups.sort_order,
        sort_order: schema.modifiers.sort_order,
        inventory_item_id: schema.modifierIngredients.inventory_item_id,
        quantity_delta: schema.modifierIngredients.quantity_delta,
        replaces_item_id: schema.modifierIngredients.replaces_item_id,
      })
      .from(schema.menuItemModifierGroups)
      .innerJoin(
        schema.modifierGroups,
        eq(schema.menuItemModifierGroups.group_id, schema.modifierGroups.id),
      )
      .innerJoin(schema.modifiers, eq(schema.modifiers.group_id, schema.modifierGroups.id))
      .leftJoin(
        schema.modifierIngredients,
        eq(schema.modifierIngredients.modifier_id, schema.modifiers.id),
      )
      .where(
        and(
          eq(schema.menuItemModifierGroups.item_id, menuItemId),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
        ),
      )
      .orderBy(schema.modifierGroups.sort_order, schema.modifiers.sort_order);

    return c.json({ success: true, data: { ingredients, modifiers } });
  },
);

// --- Items ---

// GET /items
inventory.get("/items", requirePermission("inventory:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const result = await db
    .select({
      id: schema.inventoryItems.id,
      name: schema.inventoryItems.name,
      unit: schema.inventoryItems.unit,
      current_stock: schema.inventoryItems.current_stock,
      min_stock: schema.inventoryItems.min_stock,
      cost_per_unit: schema.inventoryItems.cost_per_unit,
      barcode: schema.inventoryItems.barcode,
      internal_code: schema.inventoryItems.internal_code,
      pack_size: schema.inventoryItems.pack_size,
      pack_label: schema.inventoryItems.pack_label,
      is_active: schema.inventoryItems.is_active,
      category_id: schema.inventoryItems.category_id,
      // Kèm tên nhóm để trang Kho hàng gom nhóm được mà không phải gọi thêm lượt nữa.
      category_name: schema.inventoryCategories.name,
    })
    .from(schema.inventoryItems)
    // leftJoin chứ KHÔNG innerJoin: nguyên liệu chưa gán nhóm vẫn phải hiện ra.
    // innerJoin là chúng biến mất khỏi màn hình mà không ai biết là đang thiếu hàng.
    .leftJoin(
      schema.inventoryCategories,
      eq(schema.inventoryItems.category_id, schema.inventoryCategories.id),
    )
    .where(
      and(
        eq(schema.inventoryItems.branch_id, tenant.branchId),
        eq(schema.inventoryItems.organization_id, tenant.organizationId),
        eq(schema.inventoryItems.is_active, true),
      ),
    )
    .orderBy(schema.inventoryItems.name);

  return c.json({ success: true, data: result });
});

/**
 * GET /items/lookup?code=... - Tra nguyên liệu từ mã vừa quét.
 *
 * Khớp cả mã vạch nhà sản xuất lẫn mã nội bộ TODA-xxxx: người quét không cần biết
 * cái nhãn trước mặt là loại nào. 404 để giao diện mời gắn mã cho nguyên liệu.
 */
inventory.get(
  "/items/lookup",
  requirePermission("inventory:read"),
  zValidator("query", z.object({ code: z.string().min(1).max(64) })),
  async (c) => {
    const { code } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select()
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
          eq(schema.inventoryItems.is_active, true),
          or(
            eq(schema.inventoryItems.barcode, code.trim()),
            eq(schema.inventoryItems.internal_code, code.trim().toUpperCase()),
          ),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_code_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: item });
  },
);

// POST /items
inventory.post(
  "/items",
  requirePermission("inventory:create"),
  zValidator("json", createInventoryItemSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    if (body.categoryId) {
      const [category] = await db
        .select({ id: schema.inventoryCategories.id })
        .from(schema.inventoryCategories)
        .where(
          and(
            eq(schema.inventoryCategories.id, body.categoryId),
            eq(schema.inventoryCategories.branch_id, tenant.branchId),
            eq(schema.inventoryCategories.organization_id, tenant.organizationId),
          ),
        )
        .limit(1);

      if (!category) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_category_not_found") } },
          404,
        );
      }
    }

    if (body.barcode) {
      const taken = await findByCode(tenant, body.barcode);
      if (taken) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: t(c, "inventory_code_taken") } },
          400,
        );
      }
    }

    const [item] = await db
      .insert(schema.inventoryItems)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        category_id: body.categoryId,
        name: body.name,
        unit: body.unit,
        current_stock: String(body.currentStock),
        min_stock: String(body.minStock),
        cost_per_unit: body.costPerUnit,
        barcode: body.barcode || null,
        pack_size: String(body.packSize),
        pack_label: body.packLabel || null,
        // Mã nội bộ cấp cho MỌI nguyên liệu, kể cả loại đã có mã vạch — để nhãn dán
        // in ra lúc nào cũng dùng được, không phụ thuộc nhà sản xuất.
        internal_code: await nextInternalCode(tenant.branchId),
      })
      .returning();

    return c.json({ success: true, data: item }, 201);
  },
);

/** Tìm nguyên liệu đang giữ một mã (vạch hoặc nội bộ) trong chi nhánh. */
async function findByCode(tenant: any, code: string) {
  const [row] = await db
    .select({ id: schema.inventoryItems.id })
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.branch_id, tenant.branchId),
        or(
          eq(schema.inventoryItems.barcode, code.trim()),
          eq(schema.inventoryItems.internal_code, code.trim().toUpperCase()),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Cấp mã nội bộ "TODA-0001" tăng dần trong phạm vi chi nhánh.
 *
 * Đọc-rồi-ghi nên về lý thuyết hai người tạo cùng lúc có thể đụng nhau — chốt chặn
 * thật là unique index trong DB, ở đây chỉ cần đủ tốt cho một quầy vài người dùng.
 */
async function nextInternalCode(branchId: string): Promise<string> {
  const rows = await db
    .select({ code: schema.inventoryItems.internal_code })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.branch_id, branchId));

  let max = 0;
  for (const r of rows) {
    const m = /^TODA-(\d+)$/.exec(r.code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TODA-${String(max + 1).padStart(4, "0")}`;
}

// PATCH /items/:id
inventory.patch(
  "/items/:id",
  requirePermission("inventory:update"),
  zValidator("param", idParamSchema),
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(255).optional(),
      unit: z.string().min(1).max(50).optional(),
      minStock: z.number().min(0).optional(),
      costPerUnit: z.number().int().min(0).optional(),
      categoryId: z.string().uuid().optional().nullable(),
      barcode: z.string().max(64).optional().nullable(),
      packSize: z.number().positive().optional(),
      packLabel: z.string().max(50).optional().nullable(),
      isActive: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Gắn mã đã thuộc về nguyên liệu khác → báo rõ ràng. Để nguyên thì lỗi unique
    // index chui ra thành 500 "Lỗi máy chủ" và không ai hiểu chuyện gì xảy ra.
    if (body.barcode) {
      const holder = await findByCode(tenant, body.barcode);
      if (holder && holder.id !== id) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: t(c, "inventory_code_taken") } },
          400,
        );
      }
    }

    if (body.categoryId !== undefined && body.categoryId !== null) {
      const [category] = await db
        .select({ id: schema.inventoryCategories.id })
        .from(schema.inventoryCategories)
        .where(
          and(
            eq(schema.inventoryCategories.id, body.categoryId),
            eq(schema.inventoryCategories.branch_id, tenant.branchId),
            eq(schema.inventoryCategories.organization_id, tenant.organizationId),
          ),
        )
        .limit(1);

      if (!category) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_category_not_found") } },
          404,
        );
      }
    }

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.minStock !== undefined) updateData.min_stock = String(body.minStock);
    if (body.costPerUnit !== undefined) updateData.cost_per_unit = body.costPerUnit;
    if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
    if (body.barcode !== undefined) updateData.barcode = body.barcode || null;
    if (body.packSize !== undefined) updateData.pack_size = String(body.packSize);
    if (body.packLabel !== undefined) updateData.pack_label = body.packLabel || null;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const [updated] = await db
      .update(schema.inventoryItems)
      .set(updateData)
      .where(
        and(
          eq(schema.inventoryItems.id, id),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_item_not_found") } },
        404,
      );
    }

    return c.json({ success: true, data: updated });
  },
);

/**
 * DELETE /items/:id — xoá nguyên liệu.
 *
 * ⚠️ KHÔNG xoá cứng khi nguyên liệu đã có lịch sử. `inventory_movements` và
 * `recipe_ingredients` đều khai ON DELETE CASCADE, nên `DELETE` sẽ chạy trót lọt
 * mà cuốn theo toàn bộ phiếu nhập/xuất — mất dấu đối soát mà không báo lỗi gì.
 * Vì vậy phải ĐẾM TRƯỚC: có dấu vết thì ẩn (`is_active=false`), sạch thì mới xoá hẳn.
 *
 * (Khác chỗ xoá món ăn ở routes/menu.ts: bên đó FK là RESTRICT nên bắt lỗi 23503 là
 * đủ. Ở đây CASCADE sẽ không bao giờ ném lỗi, nên bắt lỗi là bẫy chết người.)
 */
inventory.delete(
  "/items/:id",
  requirePermission("inventory:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.id, id),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_item_not_found") } },
        404,
      );
    }

    const [{ used }] = await db
      .select({
        used: sql<number>`(
          (SELECT count(*) FROM ${schema.inventoryMovements}
            WHERE ${schema.inventoryMovements.item_id} = ${id})
        + (SELECT count(*) FROM ${schema.recipeIngredients}
            WHERE ${schema.recipeIngredients.inventory_item_id} = ${id})
        + (SELECT count(*) FROM ${schema.modifierIngredients}
            WHERE ${schema.modifierIngredients.inventory_item_id} = ${id}
               OR ${schema.modifierIngredients.replaces_item_id} = ${id})
        )::int`,
      })
      .from(sql`(SELECT 1) AS _`);

    if (used > 0) {
      await db
        .update(schema.inventoryItems)
        .set({ is_active: false })
        .where(eq(schema.inventoryItems.id, id));

      return c.json({
        success: true,
        data: { message: t(c, "inventory_item_hidden_in_use"), hidden: true },
      });
    }

    await db.delete(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    return c.json({ success: true, data: { message: t(c, "inventory_item_deleted"), hidden: false } });
  },
);

// --- Movements ---

// POST /movements
inventory.post(
  "/movements",
  requirePermission("inventory:create"),
  zValidator("json", createInventoryMovementSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.id, body.itemId),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    try {
      const movement = await recordMovement({
        itemId: body.itemId,
        type: body.type,
        quantity: body.quantity,
        reference: body.reference,
        notes: body.notes,
        createdBy: user.sub,
      });

      return c.json({ success: true, data: movement }, 201);
    } catch (err) {
      if (err instanceof InventoryItemNotFoundError) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
          404,
        );
      }
      throw err;
    }
  },
);

/**
 * POST /receipts - Một phiếu nhập nhiều dòng (quét liên tiếp rồi lưu một lần).
 *
 * Cả phiếu nằm trong MỘT transaction: nhập 8 loại mà lỗi ở loại thứ 5, ghi được
 * 4 dòng rồi dừng thì tồn kho sai mà không ai biết sai chỗ nào.
 */
inventory.post(
  "/receipts",
  requirePermission("inventory:create"),
  zValidator("json", createStockReceiptSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;

    const itemIds = [...new Set(body.lines.map((l) => l.itemId))];
    const owned = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          inArray(schema.inventoryItems.id, itemIds),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      );

    if (owned.length !== itemIds.length) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_item_not_found") } },
        404,
      );
    }

    const movements = await db.transaction(async (tx) => {
      const created: any[] = [];
      for (const line of body.lines) {
        const [movement] = await tx
          .insert(schema.inventoryMovements)
          .values({
            item_id: line.itemId,
            type: "purchase",
            quantity: String(line.quantity),
            reference: body.reference || null,
            notes: body.notes || null,
            created_by: user.sub,
            unit_cost: line.unitCost ?? null,
          })
          .returning();

        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${line.quantity})`,
            // Giá vốn bình quân gia quyền: (tồn cũ×giá cũ + nhập×giá nhập) / tổng.
            // ⚠️ Đơn vị là XU. Tồn cũ ≤ 0 (kho mới dựng) thì lấy thẳng giá nhập, chứ
            // chia cho tổng bằng 0 là ra NaN rồi ghi đè mất giá vốn.
            ...(line.unitCost != null
              ? {
                  cost_per_unit: sql`CASE
                    WHEN ${schema.inventoryItems.current_stock}::numeric > 0
                    THEN round((
                      ${schema.inventoryItems.current_stock}::numeric * ${schema.inventoryItems.cost_per_unit}
                      + ${line.quantity}::numeric * ${line.unitCost}
                    ) / (${schema.inventoryItems.current_stock}::numeric + ${line.quantity}))::int
                    ELSE ${line.unitCost}
                  END`,
                }
              : {}),
          })
          .where(eq(schema.inventoryItems.id, line.itemId));

        created.push(movement);
      }
      return created;
    });

    return c.json({ success: true, data: movements }, 201);
  },
);

/**
 * POST /issues - Phiếu xuất kho nhiều dòng: xuất dùng / đổ bỏ / kiểm kê điều chỉnh.
 *
 * `adjustment` nhận số ÂM (kiểm kê phát hiện thiếu), hai loại kia luôn dương.
 * Hướng cộng/trừ do movementSign() quyết định — một chỗ duy nhất.
 */
inventory.post(
  "/issues",
  requirePermission("inventory:create"),
  zValidator("json", createStockIssueSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;

    if (body.type !== "adjustment" && body.lines.some((l) => l.quantity <= 0)) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: t(c, "quantity_must_be_positive") },
        },
        400,
      );
    }

    const itemIds = [...new Set(body.lines.map((l) => l.itemId))];
    const owned = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          inArray(schema.inventoryItems.id, itemIds),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      );

    if (owned.length !== itemIds.length) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_item_not_found") } },
        404,
      );
    }

    const sign = movementSign(body.type);

    const movements = await db.transaction(async (tx) => {
      const created: any[] = [];
      for (const line of body.lines) {
        if (line.quantity === 0) continue;

        const [movement] = await tx
          .insert(schema.inventoryMovements)
          .values({
            item_id: line.itemId,
            type: body.type,
            quantity: String(line.quantity),
            notes: body.reason,
            created_by: user.sub,
          })
          .returning();

        const delta = sign * line.quantity;
        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${delta})`,
          })
          .where(eq(schema.inventoryItems.id, line.itemId));

        created.push(movement);
      }
      return created;
    });

    return c.json({ success: true, data: movements }, 201);
  },
);

// GET /movements
inventory.get("/movements", requirePermission("inventory:read"), zValidator("query", movementQuerySchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const { itemId } = c.req.valid("query");

  // Get items for this branch first
  const branchItems = await db
    .select({ id: schema.inventoryItems.id })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.branch_id, tenant.branchId));

  const itemIds = branchItems.map((i) => i.id);
  if (itemIds.length === 0) {
    return c.json({ success: true, data: [] });
  }

  if (itemId) {
    const [item] = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.id, itemId),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
          eq(schema.inventoryItems.organization_id, tenant.organizationId),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "item_not_found") } },
        404,
      );
    }

    const result = await db
      .select({
        id: schema.inventoryMovements.id,
        item_id: schema.inventoryMovements.item_id,
        type: schema.inventoryMovements.type,
        quantity: schema.inventoryMovements.quantity,
        reference: schema.inventoryMovements.reference,
        notes: schema.inventoryMovements.notes,
        created_at: schema.inventoryMovements.created_at,
        item_name: schema.inventoryItems.name,
      })
      .from(schema.inventoryMovements)
      .innerJoin(
        schema.inventoryItems,
        eq(schema.inventoryMovements.item_id, schema.inventoryItems.id),
      )
      .where(eq(schema.inventoryMovements.item_id, itemId))
      .orderBy(desc(schema.inventoryMovements.created_at))
      .limit(50);
    return c.json({ success: true, data: result });
  }

  // All movements for branch items
  const result = await db
    .select({
      id: schema.inventoryMovements.id,
      item_id: schema.inventoryMovements.item_id,
      type: schema.inventoryMovements.type,
      quantity: schema.inventoryMovements.quantity,
      reference: schema.inventoryMovements.reference,
      notes: schema.inventoryMovements.notes,
      created_at: schema.inventoryMovements.created_at,
      item_name: schema.inventoryItems.name,
    })
    .from(schema.inventoryMovements)
    .innerJoin(
      schema.inventoryItems,
      eq(schema.inventoryMovements.item_id, schema.inventoryItems.id),
    )
    .where(inArray(schema.inventoryMovements.item_id, itemIds))
    .orderBy(desc(schema.inventoryMovements.created_at))
    .limit(50);

  return c.json({ success: true, data: result });
});

// --- Lô hạt đang dùng ---

/**
 * Nhóm tùy chọn "Loại hạt" trên POS chỉ có Robusta/Arabica/Culi/Mộc — không có vùng
 * trồng. Nhưng kho lại đếm theo từng lô ("Hạt Arabica — Brazil Cerrado"), vì lô mới
 * khác giá lẫn khác vị. Nhập lô Ethiopia thay Brazil mà công thức vẫn trỏ lô cũ là
 * trừ vào bao đã hết.
 *
 * Hai endpoint dưới cho phép đổi lô bằng MỘT cú bấm thay vì mở lại từng món.
 */
const BEAN_GROUP_NAME = "Loại hạt";

inventory.get("/bean-lots", requirePermission("inventory:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const rows = await db
    .select({
      modifier_id: schema.modifiers.id,
      modifier_name: schema.modifiers.name,
      sort_order: schema.modifiers.sort_order,
      inventory_item_id: schema.modifierIngredients.inventory_item_id,
      replaces_item_id: schema.modifierIngredients.replaces_item_id,
      item_name: schema.inventoryItems.name,
      current_stock: schema.inventoryItems.current_stock,
    })
    .from(schema.modifiers)
    .innerJoin(schema.modifierGroups, eq(schema.modifiers.group_id, schema.modifierGroups.id))
    .leftJoin(
      schema.modifierIngredients,
      eq(schema.modifierIngredients.modifier_id, schema.modifiers.id),
    )
    .leftJoin(
      schema.inventoryItems,
      eq(schema.modifierIngredients.inventory_item_id, schema.inventoryItems.id),
    )
    .where(
      and(
        eq(schema.modifierGroups.branch_id, tenant.branchId),
        eq(schema.modifierGroups.name, BEAN_GROUP_NAME),
      ),
    )
    .orderBy(schema.modifiers.sort_order);

  return c.json({ success: true, data: rows });
});

inventory.post(
  "/bean-lots",
  requirePermission("inventory:update"),
  zValidator(
    "json",
    z.object({
      modifierId: z.string().uuid(),
      /** Lô hạt thay VÀO. */
      inventoryItemId: z.string().uuid(),
      /** Lô hạt bị thay RA — chính là hạt nền trong công thức. */
      replacesItemId: z.string().uuid(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [mod] = await db
      .select({ id: schema.modifiers.id })
      .from(schema.modifiers)
      .innerJoin(schema.modifierGroups, eq(schema.modifiers.group_id, schema.modifierGroups.id))
      .where(
        and(
          eq(schema.modifiers.id, body.modifierId),
          eq(schema.modifierGroups.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!mod) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "modifier_not_found") } },
        404,
      );
    }

    const beans = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(
          inArray(schema.inventoryItems.id, [body.inventoryItemId, body.replacesItemId]),
          eq(schema.inventoryItems.branch_id, tenant.branchId),
        ),
      );

    // Hai id có thể trùng nhau (chọn đúng hạt nền) — khi đó chỉ tra ra 1 dòng.
    const expected = body.inventoryItemId === body.replacesItemId ? 1 : 2;
    if (beans.length !== expected) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: t(c, "inventory_item_not_found") } },
        404,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.modifierIngredients)
        .where(eq(schema.modifierIngredients.modifier_id, body.modifierId));

      // Chọn đúng hạt nền = không thay gì cả, để trống là đúng.
      if (body.inventoryItemId === body.replacesItemId) return;

      await tx.insert(schema.modifierIngredients).values({
        modifier_id: body.modifierId,
        inventory_item_id: body.inventoryItemId,
        // Phép THAY giữ nguyên lượng của công thức nền, nên không cộng thêm gì.
        quantity_delta: "0",
        replaces_item_id: body.replacesItemId,
      });
    });

    return c.json({ success: true, data: { modifierId: body.modifierId } });
  },
);

// --- Categories ---

// GET /categories
inventory.get("/categories", requirePermission("inventory:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const result = await db
    .select()
    .from(schema.inventoryCategories)
    .where(
      and(
        eq(schema.inventoryCategories.branch_id, tenant.branchId),
        eq(schema.inventoryCategories.organization_id, tenant.organizationId),
      ),
    );

  return c.json({ success: true, data: result });
});

// POST /categories
inventory.post(
  "/categories",
  requirePermission("inventory:create"),
  zValidator("json", z.object({ name: z.string().min(1).max(255) })),
  async (c) => {
    const { name } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [category] = await db
      .insert(schema.inventoryCategories)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        name,
      })
      .returning();

    return c.json({ success: true, data: category }, 201);
  },
);

export { inventory };
