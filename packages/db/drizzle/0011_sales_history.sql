-- Lịch sử bán hàng từ POS cũ (01/08/2025 → 25/07/2026), nhập một lần bằng
-- scripts/import-legacy-sales.ts.
--
-- Bảng RIÊNG, không đụng `orders`: bản xuất cũ chỉ có tổng theo ngày (không có
-- từng giao dịch / khách / hình thức trả / ca làm), dựng đơn giả sẽ phá đối soát
-- quỹ và số phiếu theo ca mà chẳng thêm thông tin gì.
--
-- Tiền lưu cents (×100) như `orders.total`. bigint vì cộng dồn cả năm vượt integer.

CREATE TABLE IF NOT EXISTS "sales_history_daily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "business_date" date NOT NULL,
  "revenue" bigint DEFAULT 0 NOT NULL,
  "order_count" integer DEFAULT 0 NOT NULL,
  "source" varchar(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_history_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "business_date" date NOT NULL,
  "item_code" varchar(64),
  "item_name" varchar(255) NOT NULL,
  "group_name" varchar(128),
  "unit" varchar(20),
  "quantity" numeric(12,3) NOT NULL,
  "revenue" bigint DEFAULT 0 NOT NULL,
  "source" varchar(40) NOT NULL
);

-- Khoá duy nhất để script nhập chạy lại được mà không nhân đôi (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_history_daily"
  ON "sales_history_daily" ("branch_id", "business_date", "source");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_history_items"
  ON "sales_history_items" ("branch_id", "business_date", "item_name", "source");

CREATE INDEX IF NOT EXISTS "idx_sales_history_items_branch_date"
  ON "sales_history_items" ("branch_id", "business_date");

CREATE INDEX IF NOT EXISTS "idx_sales_history_items_name"
  ON "sales_history_items" ("branch_id", "item_name");
