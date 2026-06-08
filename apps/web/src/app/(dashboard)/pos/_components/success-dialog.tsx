"use client";

import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Check } from "lucide-react";
import { useTranslation } from "@/stores/lang-store";

// ---------------------------------------------------------------------------
// SuccessDialog
// ---------------------------------------------------------------------------

export function SuccessDialog({
  open,
  onOpenChange,
  orderNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pos.successTitle")}</DialogTitle>
        </DialogHeader>
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          {orderNumber && (
            <p className="text-2xl font-bold font-mono">{orderNumber}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {t("pos.orderSuccessHelp", "The order will appear in the kitchen automatically")}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            {t("pos.newOrder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
