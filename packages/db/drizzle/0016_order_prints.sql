-- Sổ ghi nhận đã in phiếu.
--
-- ⚠️ Trước bảng này hệ thống KHÔNG lưu bất cứ dấu vết nào về việc in: lệnh in
-- bắn qua WebSocket rồi quên, máy quầy nghe được thì in, không nghe được thì
-- thôi. Sáng 03/09/2026 mất phiếu cả hai kiểu (mất hẳn đơn, và đơn nhiều ly ra
-- thiếu tờ) mà không có cách nào truy ra đơn nào — chính vì chỗ này trống.
CREATE TABLE IF NOT EXISTS "order_prints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  -- Lô món thêm (`addOnId`); chuỗi RỖNG = phiếu gốc của đơn.
  -- ⚠️ Cố ý không dùng NULL: NULL không so bằng được nên ràng buộc UNIQUE bên
  -- dưới sẽ cho ghi trùng thoải mái, đúng cái nó sinh ra để chặn.
  "add_on_id" varchar(120) NOT NULL DEFAULT '',
  "kind" varchar(16) NOT NULL,      -- 'kitchen' | 'receipt' | 'transfer'
  "status" varchar(16) NOT NULL,    -- 'ok' | 'partial' | 'failed'
  -- Chế độ mỗi ly một phiếu: một đơn 3 ly là 3 tờ. Ra 1 tờ = 'partial'.
  "tickets_total" integer NOT NULL DEFAULT 1,
  "tickets_ok" integer NOT NULL DEFAULT 0,
  "device_label" text,
  "error" text,
  "printed_at" timestamptz NOT NULL DEFAULT now()
);

-- Chống ghi trùng khi máy quầy gửi lại xác nhận (mất mạng giữa chừng thì nó thử lại).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_prints_job"
  ON "order_prints" ("order_id", "add_on_id", "kind");
CREATE INDEX IF NOT EXISTS "idx_order_prints_order" ON "order_prints" ("order_id");
