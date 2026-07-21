-- Lưu báo cáo tổng quan cả ngày vào bản ghi ca đã đóng (thống kê hàng ngày).
ALTER TABLE "register_shifts" ADD COLUMN IF NOT EXISTS "day_summary" jsonb;
