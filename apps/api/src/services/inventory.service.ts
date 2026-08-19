import { eq, sql } from "drizzle-orm";
import { db, schema } from "@restai/db";

/**
 * Records an inventory movement and updates the item's stock accordingly.
 * Returns the created movement record.
 * Throws if the inventory item is not found.
 */
export type MovementType =
  | "purchase"
  | "consumption"
  | "waste"
  | "adjustment"
  | "issue";

/**
 * Dấu của một loại phiếu: +1 cộng vào kho, -1 trừ ra.
 *
 * ⚠️ `adjustment` trả +1 nhưng SỐ LƯỢNG được phép âm — kiểm kê phát hiện thiếu thì
 * ghi số âm. Trước đây hàm này ép `adjustment` luôn cộng, nên kiểm kê chỉ ghi được
 * chiều thừa: đếm thiếu 200g sữa mà bấm vào là kho lại TĂNG thêm 200g.
 */
export function movementSign(type: MovementType): 1 | -1 {
  return type === "purchase" || type === "adjustment" ? 1 : -1;
}

export async function recordMovement(params: {
  itemId: string;
  type: MovementType;
  quantity: number;
  reference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  unitCost?: number | null;
}): Promise<typeof schema.inventoryMovements.$inferSelect> {
  const { itemId, type, quantity, reference, notes, createdBy, unitCost } = params;

  return await db.transaction(async (tx) => {
    // Read inside transaction with row lock
    const [item] = await tx
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.id, itemId))
      .limit(1)
      .for("update");

    if (!item) {
      throw new InventoryItemNotFoundError(`Item no encontrado: ${itemId}`);
    }

    const [movement] = await tx
      .insert(schema.inventoryMovements)
      .values({
        item_id: itemId,
        type,
        quantity: String(quantity),
        reference: reference || null,
        notes: notes || null,
        created_by: createdBy || null,
        unit_cost: unitCost ?? null,
      })
      .returning();

    // Atomic stock update using SQL. Dấu do movementSign() quyết định — một chỗ duy
    // nhất, để không nơi nào tự đoán "loại này cộng hay trừ".
    //
    // ⚠️ TUYỆT ĐỐI KHÔNG thêm `::text` vào cuối biểu thức. `current_stock` là
    // numeric(10,3) trong DB; drizzle khai kiểu TS là string nên rất dễ tưởng phải
    // ép về text. Postgres KHÔNG tự ép text → numeric khi gán, và trả thẳng
    //   'column "current_stock" is of type numeric but expression is of type text'
    // → API 500. Lỗi này nằm sẵn trong code từ đầu ở CẢ recordMovement lẫn
    // deductForOrder, không ai thấy vì kho chưa từng được dùng thật; đến lúc bấm
    // "Lưu phiếu nhập" lần đầu (07/08/2026) mới lộ.
    const delta = movementSign(type) * quantity;
    await tx
      .update(schema.inventoryItems)
      .set({
        current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${delta})`,
      })
      .where(eq(schema.inventoryItems.id, itemId));

    return movement;
  });
}

/**
 * Auto-deducts inventory for a completed order based on recipe ingredients.
 * Checks if inventory tracking is enabled for the branch.
 * Marks the order as inventory_deducted to prevent double deduction.
 */
export async function deductForOrder(params: {
  orderId: string;
  orderNumber: string;
  branchId: string;
}): Promise<void> {
  const { orderId, orderNumber, branchId } = params;

  // Check if inventory is enabled for this branch
  const [branchSettings] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const inventoryEnabled = (branchSettings?.settings as any)?.inventory_enabled;

  if (!inventoryEnabled) {
    return;
  }

  const orderItemsList = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, orderId));

  // Wrap all deductions + flag in a transaction
  await db.transaction(async (tx) => {
    for (const orderItem of orderItemsList) {
      // Món nhập tay không gắn menu item → không có công thức, bỏ qua trừ kho.
      if (!orderItem.menu_item_id) continue;

      const baseRecipe = await tx
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.menu_item_id, orderItem.menu_item_id));

      if (baseRecipe.length === 0) continue;

      const chosen = await tx
        .select({
          modifier_id: schema.orderItemModifiers.modifier_id,
          modifier_name: schema.orderItemModifiers.name,
          inventory_item_id: schema.modifierIngredients.inventory_item_id,
          quantity_delta: schema.modifierIngredients.quantity_delta,
          replaces_item_id: schema.modifierIngredients.replaces_item_id,
          value_mode: schema.modifierIngredients.value_mode,
          input_value: schema.orderItemModifiers.input_value,
        })
        .from(schema.orderItemModifiers)
        .innerJoin(
          schema.modifierIngredients,
          eq(schema.modifierIngredients.modifier_id, schema.orderItemModifiers.modifier_id),
        )
        .where(eq(schema.orderItemModifiers.order_item_id, orderItem.id));

      const { amounts, modifierNames } = resolveIngredientAmounts(baseRecipe, chosen);

      const suffix = modifierNames.length ? ` (${modifierNames.join(", ")})` : "";

      for (const [inventoryItemId, perUnit] of amounts) {
        // Tùy chọn có thể trừ hết sạch một nguyên liệu ("Không đường"). Ghi phiếu 0
        // hoặc âm là bịa ra chuyện không xảy ra.
        if (perUnit <= 0) continue;
        const deductQty = perUnit * orderItem.quantity;

        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric - ${deductQty})`,
          })
          .where(eq(schema.inventoryItems.id, inventoryItemId));

        await tx.insert(schema.inventoryMovements).values({
          item_id: inventoryItemId,
          type: "consumption",
          quantity: String(deductQty),
          reference: orderNumber,
          notes: `Tự trừ: ${orderItem.name} x${orderItem.quantity}${suffix}`,
        });
      }
    }

    await tx
      .update(schema.orders)
      .set({ inventory_deducted: true })
      .where(eq(schema.orders.id, orderId));
  });
}

/**
 * Gộp công thức nền với các tùy chọn khách chọn, ra lượng dùng cho MỘT phần.
 *
 * ⚠️ THỨ TỰ Ở ĐÂY LÀ BẮT BUỘC, làm sai là sai âm thầm:
 *
 *   1. Dựng bản đồ {nguyên liệu → lượng} từ công thức nền.
 *   2. Áp `replaces_item_id` TRƯỚC — đổi hạt: chuyển lượng sang nguyên liệu mới,
 *      giữ nguyên số.
 *   3. RỒI MỚI cộng `quantity_delta`, và đích của delta cũng phải đi qua bản đồ
 *      thay thế ở bước 2.
 *   4. CUỐI CÙNG là các dòng `value_mode = 'absolute'` — con số nhân viên gõ
 *      ("Đường 13g") ĐẶT ĐÈ lên kết quả, không cộng vào.
 *
 * Ca chứng minh vì sao: ly "Cà phê đá — Arabica + Nhẹ". Cả hai tùy chọn cùng đụng
 * vào bột. Cộng dồn thẳng sẽ ra `hạt nền −24g, Arabica +18g` — sai cả hai vế.
 * Đúng phải là `Arabica −12g`, hạt nền không đụng tới.
 *
 * Tách hàm riêng (không nhét trong transaction) để test được bằng số thuần.
 */
export function resolveIngredientAmounts(
  baseRecipe: { inventory_item_id: string; quantity_used: string }[],
  chosen: {
    modifier_id: string | null;
    modifier_name: string;
    inventory_item_id: string;
    quantity_delta: string;
    replaces_item_id: string | null;
    /** 'delta' (mặc định) | 'absolute' — xem bước 4. */
    value_mode?: string | null;
    /** Con số nhân viên gõ lúc bán, chỉ có với tùy chọn kiểu số. */
    input_value?: string | null;
  }[],
): { amounts: Map<string, number>; modifierNames: string[] } {
  // Bước 1 — công thức nền.
  const amounts = new Map<string, number>();
  for (const ing of baseRecipe) {
    amounts.set(
      ing.inventory_item_id,
      (amounts.get(ing.inventory_item_id) ?? 0) + parseFloat(ing.quantity_used),
    );
  }

  // `modifier_id` null = tùy chọn đã bị xoá khỏi thực đơn; dòng order_item_modifiers
  // chỉ còn tên đã chụp lại, không còn đường nào lần ra định lượng. Bỏ qua.
  const active = chosen.filter((m) => m.modifier_id);
  const modifierNames = [...new Set(active.map((m) => m.modifier_name))];

  // Bước 2 — thay nguyên liệu (đổi loại hạt).
  const substituted = new Map<string, string>();
  for (const mod of active) {
    if (!mod.replaces_item_id) continue;
    const from = mod.replaces_item_id;
    const to = mod.inventory_item_id;
    if (from === to) continue;

    const qty = amounts.get(from);
    if (qty === undefined) continue; // Món này không dùng nguyên liệu đó — không có gì để thay.

    amounts.delete(from);
    amounts.set(to, (amounts.get(to) ?? 0) + qty);
    substituted.set(from, to);
  }

  // Bước 3 — cộng/trừ, đích đi qua bản đồ thay thế ở bước 2.
  for (const mod of active) {
    if (mod.replaces_item_id) continue;
    if (mod.value_mode === "absolute") continue; // để bước 4 lo
    const target = substituted.get(mod.inventory_item_id) ?? mod.inventory_item_id;
    const delta = parseFloat(mod.quantity_delta);
    if (!Number.isFinite(delta)) continue;
    amounts.set(target, (amounts.get(target) ?? 0) + delta);
  }

  /*
   * Bước 4 — con số nhân viên gõ, ĐẶT ĐÈ.
   *
   * ⚠️ Phải là "đặt bằng" chứ không phải "cộng vào": đường nền 7g, nhân viên gõ
   * "13g" nghĩa là ly đó dùng 13g, không phải 7+13 = 20g. Đây là toàn bộ lý do
   * `modifier_ingredients.value_mode` tồn tại.
   *
   * ⚠️ Đích vẫn phải đi qua bản đồ thay thế ở bước 2 — ly "Arabica + tự nhập" mà
   * bỏ qua chỗ này là ghi vào bao hạt nền vốn đã được chuyển đi hết.
   *
   * Đặt CUỐI cùng nên nếu vì lý do gì mà một nguyên liệu vừa có delta vừa có
   * absolute thì absolute thắng — đúng, vì đó là số người pha thật sự dùng.
   */
  for (const mod of active) {
    if (mod.replaces_item_id) continue;
    if (mod.value_mode !== "absolute") continue;
    if (mod.input_value === null || mod.input_value === undefined) continue;
    const value = parseFloat(mod.input_value);
    if (!Number.isFinite(value)) continue;
    const target = substituted.get(mod.inventory_item_id) ?? mod.inventory_item_id;
    amounts.set(target, value);
  }

  return { amounts, modifierNames };
}

/**
 * Custom error for when an inventory item is not found.
 */
export class InventoryItemNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryItemNotFoundError";
  }
}
