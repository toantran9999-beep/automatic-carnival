-- Tùy chọn kiểu GÕ SỐ: khách đòi đúng "đường 13g" thay vì chọn Ít/Vừa/Nhiều.
--
-- Trước đây cả đường dẫn chỉ chở được một cái id tùy chọn, không có chỗ nào giữ
-- con số nhân viên gõ. Ba cột dưới đây mở ba mắt xích đó ra.
--
-- Mọi giá trị mặc định giữ nguyên hành vi cũ: tùy chọn cũ là 'choice',
-- công thức cũ là 'delta'. Không cần vá dữ liệu.

-- 1) Khai báo trong thực đơn: mục này bấm chọn hay gõ số?
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "input_type"    varchar(16) NOT NULL DEFAULT 'choice';
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "unit"          varchar(16);
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "min_value"     numeric(10,3);
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "max_value"     numeric(10,3);
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "default_value" numeric(10,3);

-- 2) Con số nhân viên gõ lúc bán, chụp lại theo từng dòng món.
--    Tên cột KHÔNG đặt là "value" — đó là từ khoá SQL, tránh phiền về sau.
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "input_value" numeric(10,3);

-- 3) Công thức kho đọc con số đó thế nào:
--    'delta'    = chênh so với công thức nền (như cũ: Ít -3g, Nhiều +3g)
--    'absolute' = đặt THẲNG bằng số nhân viên gõ (gõ 13g thì trừ đúng 13g)
--
--    ⚠️ Phải phân biệt hai kiểu: đường nền 7g, nhét thẳng 13 vào quantity_delta
--    sẽ thành 7+13 = 20g.
ALTER TABLE "modifier_ingredients" ADD COLUMN IF NOT EXISTS "value_mode" varchar(16) NOT NULL DEFAULT 'delta';
