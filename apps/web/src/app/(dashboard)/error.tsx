"use client";

import { useEffect, useState } from "react";
import { Button } from "@restai/ui/components/button";

/**
 * Cùng cách chữa như `app/global-error.tsx` — xem giải thích đầy đủ ở đó.
 * ⚠️ CỐ Ý chép lại chứ không tách file dùng chung: file dùng chung có thể bị
 * webpack tách thành chunk riêng, mà chunk hỏng chính là thứ đang chữa.
 */
function isStaleBuildError(error: Error): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return (
    text.includes("ChunkLoadError") ||
    text.includes("Failed to load chunk") ||
    text.includes("Loading chunk") ||
    text.includes("Loading CSS chunk") ||
    text.includes("Importing a module script failed")
  );
}

const HEAL_FLAG = "toda_chunk_heal";

async function healStaleBuild(): Promise<void> {
  sessionStorage.setItem(HEAL_FLAG, "1");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Bỏ qua.
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // Bỏ qua.
  }
  location.reload();
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [healing, setHealing] = useState(false);

  useEffect(() => {
    if (!isStaleBuildError(error)) return;
    // Đã tự chữa một lần trong phiên này mà vẫn lỗi → đứng yên, để người đọc lỗi.
    if (sessionStorage.getItem(HEAL_FLAG)) return;
    setHealing(true);
    void healStaleBuild();
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-xl font-semibold">
        {healing ? "Đang cập nhật bản mới…" : "Lỗi bảng điều khiển"}
      </h2>
      <p className="text-muted-foreground">
        {healing
          ? "Máy đang giữ bản cũ. Đang tải lại, chờ vài giây."
          : error.message || "Đã xảy ra lỗi không mong muốn"}
      </p>
      {!healing && (
        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={() => {
              setHealing(true);
              void healStaleBuild();
            }}
          >
            Tải lại bản mới
          </Button>
          <Button variant="ghost" onClick={reset}>
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
