import * as React from "react";
import { cn } from "../utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Ô nhập dùng chung.
 *
 * ⚠️ Cao 44px (không phải 36) và chữ 16px ở MỌI khổ màn.
 *
 * Bản cũ viết `text-base md:text-sm` — ý là chống iOS tự phóng to khi gõ (Safari
 * chỉ phóng khi chữ < 16px). Nhưng `md:` đo màn hình, nên hệ quả ngoài ý muốn là
 * **máy POS màn to lại có chữ nhỏ hơn điện thoại**. Bỏ `md:text-sm` thì chữ 16px
 * khắp nơi: iOS vẫn không phóng to, mà máy quầy đọc được.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
