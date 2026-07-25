import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";
import { users } from "./auth";

/**
 * Ca bán hàng tại quầy (cash register shift). Mỗi chi nhánh chỉ có TỐI ĐA 1 ca
 * đang mở tại một thời điểm (ràng buộc bằng unique index where status='open').
 * Phải mở ca mới tạo được đơn (gate ở routes/orders). Tiền lưu dạng cents (×100).
 */
export const registerShifts = pgTable("register_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open | closed
  opened_by: uuid("opened_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  opened_at: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  opening_cash: integer("opening_cash").notNull().default(0),
  /**
   * Bộ đếm số thứ tự đơn TRONG ca này. Mở ca mới = bản ghi mới = về 0, nên đơn đầu
   * của mọi ca luôn là 01. Chỉ được tăng bằng `UPDATE … RETURNING` trong transaction
   * tạo đơn (xem order.service.ts) — đọc rồi mới ghi sẽ cấp trùng số khi 2 máy bán
   * cùng lúc.
   */
  order_seq: integer("order_seq").notNull().default(0),
  closed_by: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
  closed_at: timestamp("closed_at", { withTimezone: true }),
  closing_cash: integer("closing_cash"),
  expected_cash: integer("expected_cash"),
  cash_difference: integer("cash_difference"),
  cash_sales: integer("cash_sales"),
  total_sales: integer("total_sales"),
  order_count: integer("order_count"),
  sales_by_method: jsonb("sales_by_method"),
  // Báo cáo tổng quan CẢ NGÀY (đơn hàng completed từ 0h giờ VN) tại thời điểm đóng ca —
  // lưu lại để xem thống kê hàng ngày kể cả sau này (không phụ thuộc query lại orders).
  day_summary: jsonb("day_summary"),
  note: text("note"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
