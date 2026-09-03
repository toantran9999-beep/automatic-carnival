import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  orderTypeEnum,
  orderStatusEnum,
  orderItemStatusEnum,
} from "./enums";
import { organizations, branches } from "./tenants";
import { users } from "./auth";
import { tableSessions } from "./tables";
import { customers } from "./loyalty";
import { menuItems } from "./menu";
import { modifiers } from "./menu";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  table_session_id: uuid("table_session_id").references(
    () => tableSessions.id,
    { onDelete: "set null" },
  ),
  customer_id: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  /** Số hiện trên phiếu và mọi màn hình: "01", "02"… đếm lại từ 01 mỗi ca. */
  order_number: varchar("order_number", { length: 20 }).notNull(),
  /** Đơn thuộc ca nào — chỉ nhìn order_number ("01") thì không biết, cần cho đối soát. */
  register_shift_id: uuid("register_shift_id"),
  /** Số thứ tự trong ca, dạng số (order_number là bản đã đệm 0 để hiển thị). */
  shift_seq: integer("shift_seq"),
  type: orderTypeEnum("type").default("dine_in").notNull(),
  status: orderStatusEnum("status").default("pending").notNull(),
  customer_name: varchar("customer_name", { length: 255 }),
  subtotal: integer("subtotal").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull().default(0),
  notes: text("notes"),
  inventory_deducted: boolean("inventory_deducted").default(false).notNull(),
  /**
   * Nhân viên bấm đơn. Null = đơn cũ (trước 30/07/2026, lúc đó chưa lưu ai cả) hoặc
   * khách tự gọi qua QR. ĐỪNG suy ra từ ca làm: mỗi chi nhánh chỉ có 1 ca mở nên mọi
   * đơn cả buổi sẽ quy về cùng một người.
   */
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_orders_branch_status").on(table.branch_id, table.status),
  index("idx_orders_table_session").on(table.table_session_id),
  index("idx_orders_customer").on(table.customer_id),
  index("idx_orders_created_at").on(table.created_at),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  // Null = món nhập tay (khách gọi ngoài menu) — tên/giá lấy từ cột snapshot bên dưới.
  menu_item_id: uuid("menu_item_id").references(() => menuItems.id, {
    onDelete: "restrict",
  }),
  name: varchar("name", { length: 255 }).notNull(), // snapshot
  unit_price: integer("unit_price").notNull(), // snapshot in cents
  quantity: integer("quantity").notNull().default(1),
  total: integer("total").notNull(), // in cents
  notes: text("notes"),
  unit: varchar("unit", { length: 20 }), // snapshot đơn vị tính
  status: orderItemStatusEnum("status").default("pending").notNull(),
  /** Nhân viên thêm món này — khác `orders.created_by` khi khách gọi thêm giữa buổi. */
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  /**
   * Giờ thêm món. Để trống được vì món cũ được lấp bằng giờ đơn cha ở migration
   * 0012 — không đặt notNull kẻo một dòng sót lại là chặn cả việc bán hàng.
   */
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_order_items_order").on(table.order_id),
]);

export const orderItemModifiers = pgTable("order_item_modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_item_id: uuid("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  modifier_id: uuid("modifier_id")
    .references(() => modifiers.id, { onDelete: "set null" }),
  /**
   * Bản chụp TÊN lúc bán. Với tùy chọn kiểu gõ số, máy chủ ghép sẵn con số vào
   * đây — "Đường 13g" — nên mọi đường in và hiển thị (phiếu bếp, hóa đơn, phiếu
   * tạm tính, 3 driver in, các hộp thoại) chỉ đọc `name` là đủ, không nơi nào
   * phải biết tới `input_value`.
   */
  name: varchar("name", { length: 255 }).notNull(), // snapshot
  price: integer("price").notNull().default(0), // snapshot in cents
  /**
   * Con số nhân viên gõ (chỉ tùy chọn `input_type = 'number'`), theo đơn vị của
   * tùy chọn. Dùng để TRỪ KHO đúng lượng thật và để soi lại sau này.
   * NULL = tùy chọn bấm chọn bình thường.
   */
  input_value: numeric("input_value", { precision: 10, scale: 3 }),
});

/**
 * Sổ ghi nhận đã in phiếu — máy quầy xác nhận về sau MỖI lần in, kể cả khi hỏng.
 *
 * ⚠️ Trước bảng này việc in là "bắn đi rồi quên": không có cách nào biết một đơn
 * đã ra giấy hay chưa. Sáng 03/09/2026 mất phiếu cả hai kiểu mà không truy được
 * đơn nào. Từ nay: không có dòng nào ở đây = **chưa in**, và máy quầy tự đòi lại.
 *
 * `status = 'partial'` là trường hợp thật hay gặp nhất: chi nhánh để chế độ mỗi
 * ly một phiếu, đơn 3 ly mà máy in nuốt mất tờ 2 thì `tickets_ok = 2/3`.
 */
export const orderPrints = pgTable("order_prints", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /**
   * Lô món thêm (`addOnId`); chuỗi RỖNG = phiếu gốc của đơn.
   * ⚠️ Không dùng null: null không so bằng được nên ràng buộc UNIQUE mất tác dụng.
   */
  add_on_id: varchar("add_on_id", { length: 120 }).notNull().default(""),
  /** 'kitchen' | 'receipt' | 'transfer' */
  kind: varchar("kind", { length: 16 }).notNull(),
  /** 'ok' | 'partial' | 'failed' */
  status: varchar("status", { length: 16 }).notNull(),
  tickets_total: integer("tickets_total").notNull().default(1),
  tickets_ok: integer("tickets_ok").notNull().default(0),
  device_label: text("device_label"),
  error: text("error"),
  printed_at: timestamp("printed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_order_prints_order").on(table.order_id),
  uniqueIndex("uq_order_prints_job").on(table.order_id, table.add_on_id, table.kind),
]);
