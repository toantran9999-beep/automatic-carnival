"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsMessage } from "@restai/types";
import { useAuthStore } from "@/stores/auth-store";
import { useWebSocket } from "@/hooks/use-websocket";

/**
 * Nghe máy chủ báo "thực đơn vừa đổi" rồi bỏ cache thực đơn ngay lập tức.
 *
 * Đây là thứ cho phép giữ cache thực đơn tới 24 giờ mà vẫn KHÔNG bán nhầm giá cũ:
 * chủ quán sửa giá trên điện thoại thì máy POS cập nhật trong vòng một giây, không
 * phải chờ hết hạn. Ba lớp chồng nhau — sửa trên chính máy đó (mutation tự xoá cache),
 * máy khác sửa (kênh này), và mất mạng lúc đó (refetchOnReconnect + hạn 5 phút).
 *
 * Không vẽ gì ra màn hình.
 */
export function CacheSyncProvider() {
  const { accessToken, selectedBranchId } = useAuthStore();
  const qc = useQueryClient();

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== "menu:updated") return;
      qc.invalidateQueries({ queryKey: ["menu"] });
      qc.invalidateQueries({ queryKey: ["best-sellers"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    [qc]
  );

  useWebSocket(
    selectedBranchId ? [`branch:${selectedBranchId}`] : [],
    handleWsMessage,
    accessToken || undefined
  );

  return null;
}
