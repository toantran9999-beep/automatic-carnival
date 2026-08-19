import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { inventoryMovementTypeEnum } from "./enums";
import { organizations, branches } from "./tenants";
import { users } from "./auth";
import { menuItems, modifiers } from "./menu";

export const inventoryCategories = pgTable("inventory_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  category_id: uuid("category_id").references(() => inventoryCategories.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  current_stock: numeric("current_stock", { precision: 10, scale: 3 })
    .default("0")
    .notNull(),
  min_stock: numeric("min_stock", { precision: 10, scale: 3 })
    .default("0")
    .notNull(),
  cost_per_unit: integer("cost_per_unit").default(0).notNull(), // in cents
  /** Mã vạch nhà sản xuất (EAN-13 trên lon sữa, chai soda). Hàng lẻ ngoài chợ không có. */
  barcode: varchar("barcode", { length: 64 }),
  /** Mã nội bộ tự sinh "TODA-0001" — dán nhãn lên hũ/thùng hàng lẻ để vẫn quét được. */
  internal_code: varchar("internal_code", { length: 20 }),
  /**
   * 1 lần quét = bao nhiêu đơn vị nền. Kho đếm theo g/ml (SOP viết theo g/ml) nhưng
   * người nhập hàng bê vào "1 lon sữa đặc" chứ không ai cân 380g. Đây là chỗ quy đổi
   * duy nhất — để chỗ khác tự nhẩm là sớm muộn cũng nhẩm sai.
   */
  pack_size: numeric("pack_size", { precision: 10, scale: 3 })
    .default("1")
    .notNull(),
  /** Chữ hiện cho người dùng: "lon 380g", "thùng 12 lon", "bao 1kg". */
  pack_label: varchar("pack_label", { length: 50 }),
  /** Ngừng dùng thì ẩn, KHÔNG xoá — movements còn trỏ vào, mà đó là dấu vết đối soát. */
  is_active: boolean("is_active").default(true).notNull(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  item_id: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  type: inventoryMovementTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  /** Giá nhập mỗi đơn vị nền — ⚠️ theo XU (÷100 mới ra đồng), như mọi cột tiền khác. */
  unit_cost: integer("unit_cost"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  created_by: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    menu_item_id: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    inventory_item_id: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity_used: numeric("quantity_used", { precision: 10, scale: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.menu_item_id, table.inventory_item_id] }),
  ],
);

/**
 * Phần định lượng CHÊNH so với công thức nền khi khách chọn tùy chọn.
 *
 * Ở Toda chỗ chênh nguyên liệu lớn nhất nằm đúng ở đây: ly cà phê mặc định 18g bột
 * (2 shot), chọn "Nhẹ" còn 12g; chọn "Loại hạt — Arabica" là đổi hẳn sang bao khác.
 */
export const modifierIngredients = pgTable(
  "modifier_ingredients",
  {
    modifier_id: uuid("modifier_id")
      .notNull()
      .references(() => modifiers.id, { onDelete: "cascade" }),
    inventory_item_id: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    /**
     * CÓ DẤU: "Ít ngọt" = -3, "Thêm 1 shot" = +12. Phần lớn tùy chọn là BỚT đi.
     * ⚠️ Bỏ qua khi `value_mode = 'absolute'` (ghi 0 cho có) — lúc đó lượng dùng
     * là con số nhân viên gõ, không phải số khai sẵn ở đây.
     */
    quantity_delta: numeric("quantity_delta", { precision: 10, scale: 3 }).notNull(),
    /**
     * Đọc con số thế nào:
     *  - `delta`    (mặc định) = CHÊNH so với công thức nền, như mọi tùy chọn cũ.
     *  - `absolute` = đặt THẲNG bằng `order_item_modifiers.input_value`.
     *
     * ⚠️ Phải tách hai kiểu. Đường nền 7g; nhân viên gõ "13g" là số TUYỆT ĐỐI,
     * nhét vào `quantity_delta` sẽ thành 7+13 = 20g.
     */
    value_mode: varchar("value_mode", { length: 16 }).default("delta").notNull(),
    /**
     * Tùy chọn kiểu THAY nguyên liệu (giữ nguyên lượng), không phải cộng/trừ.
     *
     * ⚠️ Đừng thay bằng hai dòng cộng/trừ: ly "Arabica + Nhẹ" đụng vào CÙNG một
     * nguyên liệu bột. Cộng dồn sẽ ra "hạt nền −24g, Arabica +18g" — sai cả hai vế.
     * Đúng là "Arabica −12g, hạt nền không đụng tới".
     */
    replaces_item_id: uuid("replaces_item_id").references(() => inventoryItems.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.modifier_id, table.inventory_item_id] }),
    index("idx_modifier_ingredients_modifier").on(table.modifier_id),
  ],
);
