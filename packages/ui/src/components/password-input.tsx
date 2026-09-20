"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./input";
import { cn } from "../utils";

/**
 * Ô nhập mật khẩu có nút con mắt để hiện/ẩn.
 *
 * ⚠️ Chỉ hiện được CÁI ĐANG GÕ. Mật khẩu cũ trong máy chủ là băm argon2
 * (`users.password_hash`) — một chiều, không ai đọc ngược ra được, kể cả chủ
 * quán. Ai định làm nút "xem mật khẩu nhân viên" thì phải lưu mật khẩu thật,
 * tức là toàn bộ tài khoản quán nằm trần trong DB. Đừng.
 *
 * Nút đặt TRONG ô (absolute) chứ không đứng cạnh: ô nhập vẫn chiếm trọn hàng,
 * và nút giữ đủ 44px theo luật vùng chạm của máy POS.
 */
export interface PasswordInputProps extends Omit<InputProps, "type"> {
  /** Nhãn cho trình đọc màn hình; mặc định tiếng Việt. */
  showLabel?: string;
  hideLabel?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showLabel = "Hiện mật khẩu", hideLabel = "Ẩn mật khẩu", ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative w-full">
        <Input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-12", className)}
        />
        <button
          type="button"
          // `tabIndex={-1}` để gõ Tab đi thẳng từ ô mật khẩu sang nút Lưu,
          // không vướng con mắt ở giữa.
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          title={visible ? hideLabel : showLabel}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
