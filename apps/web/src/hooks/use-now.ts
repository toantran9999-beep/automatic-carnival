"use client";
import { useEffect, useState } from "react";

/**
 * Mốc "bây giờ" tự nhảy mỗi 30 giây — dùng chung cho mọi chỗ đếm thời gian trôi
 * (thẻ bàn, thẻ đơn mang về, hộp thoại chi tiết).
 *
 * ⚠️ `enabled` KHÔNG phải để cho đẹp: mỗi lần nhảy là cả cây thẻ vẽ lại. Tab đang ẩn
 * hay hộp thoại đang đóng thì phải tắt, kẻo màn hình POS cứ 30 giây lại dựng lại một
 * lưới bàn chẳng ai nhìn.
 *
 * Đặt lại mốc ngay khi bật, để lúc mở ra không hiện con số cũ của lần trước.
 */
export function useNow(enabled = true, intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);

  return now;
}
