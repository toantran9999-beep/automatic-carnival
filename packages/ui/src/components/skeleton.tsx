import * as React from "react";
import { cn } from "../utils";

/**
 * Ô xám nhấp nháy lúc chờ dữ liệu.
 *
 * Hàm này trước đây được **định nghĩa lại trong 32 file** — cùng một 3 dòng, chép
 * đi chép lại. Dùng bản này cho code mới; các file cũ thay dần khi có dịp đụng vào
 * (không quét cả repo một lần cho khỏi đụng nhiều thứ đang chạy).
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-pulse rounded bg-muted", className)} {...props} />
  );
}
