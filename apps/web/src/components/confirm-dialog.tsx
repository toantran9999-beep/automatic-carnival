"use client";

import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";

import { useTranslation } from "@/stores/lang-store";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: "destructive" | "default";
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  loading,
  variant = "destructive",
  confirmLabel,
  cancelLabel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading
              ? t("common.saving")
              : confirmLabel ?? (variant === "destructive" ? t("common.delete") : t("common.confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
