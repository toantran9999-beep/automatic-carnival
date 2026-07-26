"use client";

import { useEffect, useState } from "react";

/**
 * Lỗi "Failed to load chunk /_next/static/chunks/<mã băm>.js".
 *
 * Nguyên nhân: service worker phục vụ HTML của bản build CŨ, mà file JS bản cũ
 * đã bị build mới xoá khỏi máy chủ → 404. Bấm "Thử lại" vô ích vì nó vẽ lại từ
 * đúng cái HTML cũ đó. Máy POS kẹt vĩnh viễn cho tới khi xoá bộ nhớ đệm bằng tay.
 *
 * ⚠️ CỐ Ý chép logic này ở cả `global-error.tsx` lẫn `(dashboard)/error.tsx` thay
 * vì tách ra file dùng chung: file dùng chung có thể bị webpack tách thành một
 * chunk RIÊNG — mà chunk hỏng chính là thứ ta đang chữa. Tự chữa thì không được
 * phụ thuộc vào cái đang hỏng.
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

// ⚠️ Chốt chống lặp. Không có nó, lỗi nào khớp chuỗi trên mà tải lại KHÔNG khỏi
// sẽ làm máy quay vòng tải lại vô tận — tệ hơn hẳn màn báo lỗi đứng yên.
const HEAL_FLAG = "toda_chunk_heal";

async function healStaleBuild(): Promise<void> {
  sessionStorage.setItem(HEAL_FLAG, "1");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Xoá cache hỏng cũng không sao — vẫn thử gỡ service worker rồi tải lại.
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

export default function GlobalError({
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
    <html lang="vi">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui",
            gap: "1rem",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            {healing ? "Đang cập nhật bản mới…" : "Đã xảy ra lỗi"}
          </h2>
          <p style={{ color: "#666" }}>
            {healing
              ? "Máy đang giữ bản cũ. Đang tải lại, chờ vài giây."
              : error.message || "Đã xảy ra lỗi không mong muốn"}
          </p>
          {!healing && (
            <button
              onClick={() => {
                setHealing(true);
                void healStaleBuild();
              }}
              style={{
                padding: "0.5rem 1rem",
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Tải lại bản mới
            </button>
          )}
          {!healing && (
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                color: "#666",
                border: "none",
                cursor: "pointer",
              }}
            >
              Thử lại
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
