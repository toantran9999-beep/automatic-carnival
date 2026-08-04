-- Nhịp thở của cầu nối thông báo ngân hàng (APK vn.toda.bankbridge).
--
-- Vì sao cần: cầu nối chỉ lên tiếng khi có tiền vào, nên "im vì chết" và "im vì
-- vắng khách" nhìn y hệt nhau. Ngày 04/08/2026 nó im 9 tiếng liền (12:51→21:38),
-- hai lượt chuyển khoản lúc 20:40 phải bấm tay mà không ai biết là hỏng.
--
-- Vì sao bảng riêng chứ không nhét vào branches.settings: settings là JSONB do
-- người dùng sửa qua giao diện Cài đặt, ghi đè mỗi 5 phút là đua nhau với nút Lưu.
-- Vì sao không giữ trong bộ nhớ tiến trình: deploy lại là mất, POS sẽ báo đỏ oan.

CREATE TABLE IF NOT EXISTS "bridge_heartbeats" (
  -- Một chi nhánh một điện thoại cầu nối, nên branch_id làm luôn khoá chính.
  "branch_id"    uuid PRIMARY KEY REFERENCES "branches"("id") ON DELETE CASCADE,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  -- Phiên bản APK do chính điện thoại khai. Đây là cách duy nhất biết máy đang
  -- chạy bản nào mà không phải cầm máy lên xem.
  "app_version"  varchar(30),
  -- Số thông báo còn kẹt trong hàng đợi điện thoại. Cứ tăng mà không về 0 là
  -- gửi không được.
  "queue_size"   integer NOT NULL DEFAULT 0,
  -- Điện thoại còn quyền đọc thông báo hay không. Có nhịp thở mà cái này false
  -- thì app sống nhưng mù — vẫn phải báo đỏ.
  "listener_ok"  boolean NOT NULL DEFAULT true,
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
