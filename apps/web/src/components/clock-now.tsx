"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/** Đồng hồ thời gian thực HH:MM:SS (giờ VN), cập nhật mỗi giây. */
export function ClockNow({ className }: { className?: string }) {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Ho_Chi_Minh",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <div
      className={
        "hidden sm:flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-medium tabular-nums text-muted-foreground " +
        (className ?? "")
      }
    >
      <Clock className="h-3.5 w-3.5 text-primary" />
      {now}
    </div>
  );
}
