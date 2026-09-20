"use client";

import { useState } from "react";
import { Copy, Info, Wand2 } from "lucide-react";
import { PasswordInput } from "@restai/ui/components/password-input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { useChangePassword } from "@/hooks/use-staff";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: any | null;
}

/**
 * Đổi mật khẩu nhân viên.
 *
 * ⚠️ KHÔNG có nút "xem mật khẩu cũ" và sẽ không bao giờ có: `users.password_hash`
 * là băm argon2 một chiều, máy chủ cũng không đọc ngược ra được. Muốn có nút đó
 * thì phải lưu mật khẩu thật trong DB — tức là ai xem được DB (kể cả lộ một bản
 * sao lưu) là cầm luôn tài khoản của cả quán. Đổi lại, ở đây cho:
 *   1. hiện mật khẩu ĐANG GÕ (con mắt) để khỏi gõ sai rồi nhân viên không vào được,
 *   2. nút gợi ý mật khẩu dễ đọc,
 *   3. nút sao chép để dán vào chỗ anh Toàn lưu.
 */

// Bỏ các ký tự dễ đọc nhầm khi chép tay/đọc qua điện thoại: 0-O, 1-l-I.
const SAFE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function suggestPassword() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  // `% length` lệch tần suất một chút — chỗ này là gợi ý cho người gõ tay, không
  // phải sinh khoá, nên chấp nhận được.
  const body = Array.from(bytes, (b) => SAFE_CHARS[b % SAFE_CHARS.length]).join("");
  return `toda${body}`;
}

export function PasswordDialog({ open, onOpenChange, member }: PasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const changePassword = useChangePassword();
  const { t } = useTranslation();

  const handleChange = async () => {
    if (!member || newPassword.length < 8) {
      toast.error(t("staff.minPasswordLength"));
      return;
    }
    try {
      await changePassword.mutateAsync({ id: member.id, password: newPassword });
      toast.success(t("staff.passwordUpdated"));
      onOpenChange(false);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || t("staff.passwordError"));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      toast.success(t("staff.passwordCopied"));
    } catch {
      // Máy POS chạy qua http (không phải https) thì trình duyệt khoá clipboard —
      // báo thật cho người dùng chứ đừng im lặng như đã chép được.
      toast.error(t("staff.passwordCopyFailed"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNewPassword("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staff.passwordDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {member && (
            <p className="text-sm text-muted-foreground">
              {t("staff.changePassword")}{" "}
              <span className="font-medium text-foreground">{member.name}</span>
            </p>
          )}

          <div className="flex gap-2 rounded-md border bg-muted/40 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-snug text-muted-foreground">
              {t("staff.passwordCannotView")}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("staff.newPassword")}</Label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("staff.passwordHelp")}
              autoComplete="new-password"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setNewPassword(suggestPassword())}
              >
                <Wand2 className="mr-1.5 h-4 w-4" />
                {t("staff.passwordSuggest")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!newPassword}
                onClick={handleCopy}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                {t("staff.passwordCopy")}
              </Button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive">{t("staff.minPasswordLength")}</p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleChange}
            disabled={changePassword.isPending || newPassword.length < 8}
          >
            {changePassword.isPending ? t("staff.changing") : t("staff.changePassword")}
          </Button>

          <p className="text-center text-xs leading-snug text-muted-foreground">
            {t("staff.passwordSaveReminder")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
