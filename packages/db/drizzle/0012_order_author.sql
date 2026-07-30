-- Ghi lại AI bấm đơn và AI thêm món, kèm giờ của từng món.
--
-- Trước đây tên người bấm đơn chỉ tồn tại đúng một lần trong gói tin WebSocket gửi
-- cho trạm quầy in phiếu, rồi biến mất — không có cột nào lưu, cũng không có bảng
-- log nào. Suy qua ca làm (`register_shifts.opened_by`) là vô dụng vì mỗi chi nhánh
-- chỉ có 1 ca mở, mọi đơn cả buổi quy về cùng một người.
--
-- ⚠️ Đơn CŨ sẽ trống người order vĩnh viễn. Không có gì để backfill — thông tin đó
-- chưa từng được lưu, và bịa ra thì tệ hơn để trống.

-- ON DELETE SET NULL: xoá nhân viên thì đơn vẫn còn, chỉ mất tên. Không được để mất đơn.
ALTER TABLE "orders"      ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- Giờ của từng món — cần cho ca "khách gọi thêm": món thêm sau có giờ khác đơn cha.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "created_at" timestamptz;

-- Món cũ: lấy giờ của ĐƠN CHA.
-- ⚠️ KHÔNG thêm cột với DEFAULT now() rồi để đó: làm vậy là mọi món trong quá khứ
-- đều mang giờ chạy migration — bịa số, mà bịa im lặng. Lấp bằng giờ đơn cha thì
-- đúng với món gốc, và là ước lượng tốt nhất có được cho món gọi thêm.
UPDATE "order_items" oi
   SET "created_at" = o."created_at"
  FROM "orders" o
 WHERE oi."order_id" = o."id" AND oi."created_at" IS NULL;

-- Từ đây món mới tự có giờ.
ALTER TABLE "order_items" ALTER COLUMN "created_at" SET DEFAULT now();

CREATE INDEX IF NOT EXISTS "idx_orders_created_by" ON "orders" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_order_items_created_by" ON "order_items" ("created_by");
