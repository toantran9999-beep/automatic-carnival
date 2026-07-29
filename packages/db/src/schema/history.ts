import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  numeric,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";

/**
 * Lịch sử bán hàng từ HỆ THỐNG CŨ (trước 26/07/2026).
 *
 * Vì sao là bảng riêng chứ không nhét vào `orders`: bản xuất của POS cũ chỉ có
 * TỔNG THEO NGÀY — không có từng giao dịch, không có khách, không có hình thức
 * thanh toán, không có ca làm. Dựng đơn giả để nhét vào `orders` sẽ phá đối soát
 * quỹ, số phiếu theo ca và mọi báo cáo vận hành, đổi lại chẳng thêm thông tin gì.
 *
 * Tiền lưu dạng cents (×100) cho đồng nhất với `orders.total`. Dùng bigint vì tổng
 * cả năm (~918 triệu đồng → 91,8 tỉ cents) vượt integer khi cộng dồn ở tầng ứng dụng.
 */
export const salesHistoryDaily = pgTable(
  "sales_history_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    /** Ngày làm ăn theo giờ VN. Kiểu `date` chứ không phải timestamp: bản xuất cũ
     *  không có giờ, ép sang timestamp là tự bịa ra múi giờ không tồn tại. */
    business_date: date("business_date").notNull(),
    revenue: bigint("revenue", { mode: "number" }).notNull().default(0),
    order_count: integer("order_count").notNull().default(0),
    /** Nguồn dữ liệu, vd 'legacy-pos'. Giữ để sau này tách bạch được với dữ liệu thật. */
    source: varchar("source", { length: 40 }).notNull(),
  },
  (table) => [
    unique("uq_sales_history_daily").on(
      table.branch_id,
      table.business_date,
      table.source,
    ),
  ],
);

/**
 * Lịch sử bán hàng theo TỪNG MÓN mỗi ngày (ma trận món × ngày của hệ cũ).
 *
 * CỐ Ý giữ nguyên tên món của hệ cũ, KHÔNG khoá ngoại sang `menu_items`: tên hai
 * hệ lệch nhau (vd hệ cũ có SKU riêng "Cà phê đá (nhẹ)", hệ mới là món "Cà phê đá"
 * kèm tuỳ chọn "Nhẹ −2.000đ"). Ép ánh xạ lúc nhập là làm hỏng dữ liệu gốc — muốn
 * đối chiếu thì làm ở tầng báo cáo, nơi sửa lại được.
 */
export const salesHistoryItems = pgTable(
  "sales_history_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    business_date: date("business_date").notNull(),
    /** Mã món của hệ cũ ('SP01', 'ITEM-G7ZN'…). Có dòng không có mã. */
    item_code: varchar("item_code", { length: 64 }),
    item_name: varchar("item_name", { length: 255 }).notNull(),
    group_name: varchar("group_name", { length: 128 }),
    unit: varchar("unit", { length: 20 }),
    /** Số thập phân vì hệ cũ từng bán cà phê theo GRAM (số lượng = số gram). */
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    revenue: bigint("revenue", { mode: "number" }).notNull().default(0),
    source: varchar("source", { length: 40 }).notNull(),
  },
  (table) => [
    unique("uq_sales_history_items").on(
      table.branch_id,
      table.business_date,
      table.item_name,
      table.source,
    ),
    index("idx_sales_history_items_branch_date").on(
      table.branch_id,
      table.business_date,
    ),
    index("idx_sales_history_items_name").on(table.branch_id, table.item_name),
  ],
);

/** Ngày cuối cùng hệ thống cũ còn ghi nhận. Từ 26/07/2026 trở đi là POS mới. */
export const LEGACY_CUTOVER_DATE = "2026-07-25";
export const LEGACY_SOURCE = "legacy-pos";
