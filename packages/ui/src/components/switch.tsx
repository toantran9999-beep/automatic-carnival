"use client";

import * as React from "react";
import { cn } from "../utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Nút gạt bật/tắt dùng chung.
 *
 * Trước đây đoạn markup này bị **chép tay 8 lần** ở 5 file (cài đặt chi nhánh,
 * thiết bị, hóa đơn, kết nối, bàn ăn) — mỗi bản một kiểu, sửa một chỗ không lan
 * sang chỗ khác. Từ nay chỉ còn một nguồn.
 *
 * ⚠️ Vùng bấm phải là 44×44 (chuẩn cảm ứng) chứ không phải 24×44 như hình nút.
 * Máy POS bấm bằng ngón tay, nút cao 24px là bấm trượt thật. Hình nút giữ nguyên
 * cỡ cũ để không đổi bố cục; phần nới ra nằm ở lớp đệm TRONG SUỐT bao ngoài, nên
 * không chiếm thêm chỗ nhìn thấy được (`-my-2.5` kéo lại chiều cao dòng).
 *
 * Cố ý KHÔNG dùng Radix: markup `<button role="switch" aria-checked>` đã đúng
 * chuẩn trợ năng sẵn, thêm một gói phụ thuộc chỉ tổ nặng thêm lần build trên VPS.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Lớp ngoài: chỉ để mở rộng vùng bấm, không có hình.
        "group -my-2.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
          // Viền focus vẽ ở lớp hình cho thấy rõ, vì lớp ngoài trong suốt.
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  ),
);
Switch.displayName = "Switch";
