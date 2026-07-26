"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { useStationStore } from "@/stores/station-store";

/** Hết 8 tiếng là điện thoại nhân viên tự văng ra, phải đăng nhập & quét lại. */
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;

/** Vai trò KHÔNG bị giới hạn giờ — chủ quán xem sổ buổi tối không lý gì bị đá ra. */
const UNLIMITED_ROLES = ["super_admin", "org_admin", "branch_manager"];

/**
 * Giới hạn 8 tiếng cho phiên trên máy nhân viên.
 *
 * Lý do: nhân viên nghỉ ca vẫn mở app xem được bàn nào có khách, bàn nào trống.
 * Mốc giờ được đặt lại mỗi lần kết nối với trạm (quét QR / chọn chi nhánh), nên
 * "vào ca là kết nối lại" cũng chính là "làm mới phiên".
 *
 * ⚠️ Đây là khoá phía máy nhân viên, không phải khoá thật ở máy chủ: token còn
 * hạn 7 ngày nằm trong máy, ai biết dùng công cụ lập trình của trình duyệt vẫn
 * lách được. Đủ cho chuyện tò mò mở app coi bàn; muốn chặn triệt để thì phải
 * theo dõi & thu hồi phiên ở máy chủ.
 */
export function SessionExpiryProvider() {
  const router = useRouter();
  const kicked = useRef(false);

  useEffect(() => {
    const check = () => {
      if (kicked.current) return;
      const { accessToken, user, sessionStartedAt, renewSession, logout } =
        useAuthStore.getState();
      if (!accessToken || !user) return;

      // Máy trạm quầy là máy in — văng ra là cả quán mất phiếu đặt món.
      if (useStationStore.getState().isStation) return;
      if (UNLIMITED_ROLES.includes(user.role)) return;

      // Người đang đăng nhập từ trước khi có tính năng này thì tính giờ từ bây
      // giờ, chứ không đá ra ngay giữa ca lúc vừa cập nhật.
      if (!sessionStartedAt) {
        renewSession();
        return;
      }

      if (Date.now() - sessionStartedAt < SESSION_MAX_MS) return;

      kicked.current = true;
      logout();
      toast.info(
        "Hết phiên 8 tiếng — đăng nhập rồi quét lại mã kết nối ở quầy khi vào ca.",
        { duration: 8000 }
      );
      router.replace("/login");
    };

    check();
    const timer = setInterval(check, 60_000);
    // Điện thoại nằm trong túi cả buổi: hẹn giờ bị hệ điều hành treo, nên lúc mở
    // màn hình ra phải kiểm lại ngay.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
