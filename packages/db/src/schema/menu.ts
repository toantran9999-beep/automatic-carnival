import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  image_url: text("image_url"),
  sort_order: integer("sort_order").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(), // stored in cents
  image_url: text("image_url"),
  is_available: boolean("is_available").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  preparation_time_min: integer("preparation_time_min"),
  unit: varchar("unit", { length: 20 }), // đơn vị tính: Ly, Phần, Gói...
}, (table) => [
  index("idx_menu_items_branch").on(table.branch_id),
  index("idx_menu_items_category").on(table.category_id),
]);

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  min_selections: integer("min_selections").default(0).notNull(),
  max_selections: integer("max_selections").default(1).notNull(),
  is_required: boolean("is_required").default(false).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
});

export const modifiers = pgTable("modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  group_id: uuid("group_id")
    .notNull()
    .references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  price: integer("price").default(0).notNull(), // stored in cents
  is_available: boolean("is_available").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),

  /**
   * `choice` = bấm chọn (mặc định, mọi tùy chọn cũ).
   * `number` = nhân viên GÕ SỐ lúc bán — khách đòi đúng "đường 13g" mà 5 mức bấm
   * sẵn không diễn tả hết. Con số gõ ra nằm ở `order_item_modifiers.input_value`.
   *
   * ⚠️ Chỉ nhân viên POS được gõ; màn khách quét QR lọc bỏ kiểu này
   * (xem `routes/customer.ts`) — khách lạ không biết 13g là nhiều hay ít.
   */
  input_type: varchar("input_type", { length: 16 }).default("choice").notNull(),
  /** Đơn vị hiện cạnh ô nhập và ghép vào tên in ra phiếu: "g", "ml", "shot". */
  unit: varchar("unit", { length: 16 }),
  /**
   * Khoảng hợp lệ. ⚠️ Đặt `max_value` sát thực tế: kho chỉ trừ MỘT LẦN cho mỗi
   * đơn (`orders.inventory_deducted`), gõ nhầm 130g thay vì 13g là phải chỉnh
   * kho bằng tay.
   */
  min_value: numeric("min_value", { precision: 10, scale: 3 }),
  max_value: numeric("max_value", { precision: 10, scale: 3 }),
  /** Điền sẵn vào ô cho nhân viên bớt gõ — thường bằng đúng liều nền của công thức. */
  default_value: numeric("default_value", { precision: 10, scale: 3 }),
});

export const menuItemModifierGroups = pgTable(
  "menu_item_modifier_groups",
  {
    item_id: uuid("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    group_id: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.item_id, table.group_id] }),
  ],
);
