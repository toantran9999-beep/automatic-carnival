-- Kho hàng thật cho quán cà phê: mã vạch để quét nhập/xuất, và định lượng theo
-- tùy chọn khách chọn.
--
-- Vì sao cần: bảng kho đang có sẵn nhưng chỉ trừ được theo "công thức nền của món".
-- Ở Toda, chỗ chênh lệch nguyên liệu LỚN NHẤT lại nằm ở tùy chọn: một ly cà phê đá
-- mặc định 18g bột (2 shot), chọn "Nhẹ" còn 12g (1 shot); chọn "Loại hạt — Arabica"
-- là đổi hẳn sang bao hạt khác. Không mô hình hoá được mấy cái đó thì tồn kho sai
-- ngay từ ly đầu tiên, mà sai âm thầm — số vẫn nhúc nhích nên không ai nghi ngờ.

-- ---------------------------------------------------------------------------
-- 1) Mã vạch + quy cách đóng gói cho nguyên liệu
-- ---------------------------------------------------------------------------

-- Mã vạch nhà sản xuất (EAN-13 in trên lon sữa đặc, chai soda…). Null vì hàng lẻ
-- ngoài chợ (chanh, tắc, dâu) không có mã nào cả.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "barcode" varchar(64);

-- Mã nội bộ tự sinh "TODA-0001" — dán nhãn lên hũ/thùng hàng lẻ để vẫn quét được.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "internal_code" varchar(20);

-- 1 lần quét = bao nhiêu ĐƠN VỊ NỀN. Kho đếm theo g/ml (vì SOP viết theo g/ml),
-- nhưng người nhập hàng bê vào "1 lon sữa đặc" chứ không ai cân 380g. pack_size
-- là chỗ quy đổi duy nhất, để nhân viên khỏi nhẩm trong đầu rồi nhẩm sai.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "pack_size" numeric(10,3) NOT NULL DEFAULT 1;

-- Chữ hiện cho người dùng: "lon 380g", "thùng 12 lon", "bao 1kg".
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "pack_label" varchar(50);

-- Nguyên liệu ngừng dùng thì ẨN, không xoá — inventory_movements còn trỏ vào và
-- lịch sử nhập/xuất là thứ để đối soát, xoá đi là mất dấu.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- Unique THEO CHI NHÁNH chứ không unique toàn cục: hai chi nhánh cùng mua một loại
-- sữa đặc thì cả hai đều phải quét được mã đó, mỗi bên một dòng tồn riêng.
-- Partial index (WHERE ... IS NOT NULL) vì hầu hết nguyên liệu không có mã vạch,
-- mà NULL trong unique index thường sẽ nhân bản vô tội vạ.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_items_branch_barcode"
  ON "inventory_items" ("branch_id", "barcode") WHERE "barcode" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_items_branch_internal_code"
  ON "inventory_items" ("branch_id", "internal_code") WHERE "internal_code" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Giá nhập ghi ngay trên phiếu nhập
-- ---------------------------------------------------------------------------

-- ⚠️ Đơn vị là XU (chia 100 mới ra đồng) — giống mọi cột tiền khác trong DB.
-- Đọc thẳng ra màn hình là báo cáo sai gấp 100 lần.
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "unit_cost" integer;

-- ---------------------------------------------------------------------------
-- 3) Loại phiếu "xuất kho"
-- ---------------------------------------------------------------------------

-- Tách khỏi 'waste': đổ bỏ vì hư và xuất mang đi dùng là hai chuyện khác nhau.
-- Gộp chung thì báo cáo hao hụt phồng lên và không ai biết quán thật sự hư bao nhiêu.
--
-- ⚠️ Drizzle chạy TẤT CẢ migration đang chờ trong MỘT transaction, và Postgres không
-- cho DÙNG giá trị enum vừa thêm trước khi transaction đó commit. Thêm ở đây thì
-- được, nhưng migration nào sau này cần INSERT/so sánh với 'issue' phải nằm ở một
-- lần deploy KHÁC — cùng lượt là lỗi "unsafe use of new value of enum type".
ALTER TYPE "inventory_movement_type" ADD VALUE IF NOT EXISTS 'issue';

-- ---------------------------------------------------------------------------
-- 4) Định lượng theo tùy chọn
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "modifier_ingredients" (
  "modifier_id"       uuid NOT NULL REFERENCES "modifiers"("id") ON DELETE CASCADE,
  "inventory_item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE CASCADE,

  -- CÓ DẤU. "Ít ngọt" = -3, "Thêm 1 shot" = +12. Phần lớn tùy chọn ở Toda là BỚT
  -- đi so với nền chứ không phải thêm vào, nên cột này bắt buộc nhận số âm.
  "quantity_delta"    numeric(10,3) NOT NULL,

  -- Tùy chọn kiểu THAY nguyên liệu, không phải cộng/trừ. "Loại hạt — Arabica"
  -- nghĩa là: thay hạt nền bằng Arabica, GIỮ NGUYÊN lượng.
  --
  -- Vì sao phải có cột này thay vì viết thành hai dòng cộng/trừ: ly "Arabica + Nhẹ"
  -- đụng vào CÙNG một nguyên liệu bột. Coi cả hai là cộng dồn thì ra
  -- "hạt nền -24g, Arabica +18g" — sai cả hai vế. Đúng phải là "Arabica -12g,
  -- hạt nền không đụng tới".
  "replaces_item_id"  uuid REFERENCES "inventory_items"("id") ON DELETE CASCADE,

  PRIMARY KEY ("modifier_id", "inventory_item_id")
);

CREATE INDEX IF NOT EXISTS "idx_modifier_ingredients_modifier"
  ON "modifier_ingredients" ("modifier_id");
