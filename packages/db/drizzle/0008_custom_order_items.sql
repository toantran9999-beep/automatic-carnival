-- Món nhập tay (khách gọi ngoài menu): order_items không bắt buộc gắn menu item.
-- Tên + giá đã snapshot sẵn trong cột name/unit_price nên dữ liệu cũ không ảnh hưởng.
ALTER TABLE "order_items" ALTER COLUMN "menu_item_id" DROP NOT NULL;
