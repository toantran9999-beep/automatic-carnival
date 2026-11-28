-- Giá shot HẠT ĐẮT: cùng một ly thì máy lấy giá cao hơn (anh Toàn chốt 28/11/2026).
--
-- "Cà phê đá + Thêm 1 shot Brazil" từng ra 23k — bằng đúng ly 1 shot Brazil bán lẻ,
-- trong khi ly đó còn thêm 2 shot Robusta. Đúng phải là 33k. Cách tính nằm ở
-- `packages/config/src/bean-shot-pricing.ts`; hai cột dưới đây cho nó biết tùy
-- chọn nào là shot và shot đó thuộc hạt nào.
--
-- null ở cả hai cột = tùy chọn không dính tới shot → giá giữ nguyên như cũ.

-- Số shot tùy chọn thêm/bớt: Nhẹ = -1, Thêm 1 shot = 1, Thêm 2 shot = 2.
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "shots" smallint;
-- Shot của loại hạt nào: trỏ tới tùy chọn trong nhóm "Loại hạt" (vd Arabica Brazil).
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "shot_bean_id" uuid REFERENCES "modifiers"("id") ON DELETE SET NULL;

-- Điền theo TÊN thật trên POS (đọc từ DB 28/11/2026). Chạy lại vô hại.
UPDATE "modifiers" m SET "shots" = -1
  FROM "modifier_groups" g
 WHERE g."id" = m."group_id" AND g."name" = 'Độ đậm' AND m."name" = 'Nhẹ';

UPDATE "modifiers" m SET "shots" = 1
  FROM "modifier_groups" g
 WHERE g."id" = m."group_id" AND g."name" IN ('Món thêm', 'Món thêm có sữa')
   AND m."name" = 'Thêm 1 shot cà phê';

UPDATE "modifiers" m SET "shots" = 2
  FROM "modifier_groups" g
 WHERE g."id" = m."group_id" AND g."name" IN ('Món thêm', 'Món thêm có sữa')
   AND m."name" = 'Thêm 2 shot cà phê';

-- Shot hạt đắt: trỏ tới tùy chọn Loại hạt CÙNG CHI NHÁNH.
UPDATE "modifiers" m SET "shots" = 1, "shot_bean_id" = bean."id"
  FROM "modifier_groups" g, "modifier_groups" bg, "modifiers" bean
 WHERE g."id" = m."group_id" AND g."name" = 'Món thêm'
   AND m."name" = 'Thêm 1 shot cà phê Brazil'
   AND bg."branch_id" = g."branch_id" AND bg."name" = 'Loại hạt'
   AND bean."group_id" = bg."id" AND bean."name" = 'Arabica Brazil';

UPDATE "modifiers" m SET "shots" = 1, "shot_bean_id" = bean."id"
  FROM "modifier_groups" g, "modifier_groups" bg, "modifiers" bean
 WHERE g."id" = m."group_id" AND g."name" = 'Món thêm'
   AND m."name" = 'Thêm 1 shot cà phê Cầu Đất'
   AND bg."branch_id" = g."branch_id" AND bg."name" = 'Loại hạt'
   AND bean."group_id" = bg."id" AND bean."name" = 'Arabica Cầu Đất';
