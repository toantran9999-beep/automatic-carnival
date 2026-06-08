"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staff.passwordDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {member && (
            <p className="text-sm text-muted-foreground">
              {t("staff.changePassword")} <span className="font-medium text-foreground">{member.name}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label>{t("staff.newPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("staff.passwordHelp")}
            />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
