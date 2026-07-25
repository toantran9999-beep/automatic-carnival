-- Số thứ tự đơn đếm theo ca: mỗi ca bắt đầu lại từ 01.
-- Bộ đếm nằm trên chính bản ghi ca; mở ca mới là bản ghi mới nên tự về 0,
-- không cần lệnh reset nào.
ALTER TABLE "register_shifts" ADD COLUMN IF NOT EXISTS "order_seq" integer NOT NULL DEFAULT 0;

-- Lưu đơn thuộc ca nào + số thứ tự trong ca đó. Chỉ nhìn order_number ("01") thì
-- không biết của ca nào, 2 cột này để đối soát về sau.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "register_shift_id" uuid REFERENCES "register_shifts"("id") ON DELETE SET NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shift_seq" integer;

CREATE INDEX IF NOT EXISTS "idx_orders_register_shift" ON "orders" ("register_shift_id");
