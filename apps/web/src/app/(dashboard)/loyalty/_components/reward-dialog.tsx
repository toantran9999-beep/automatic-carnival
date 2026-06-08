"use client";

import { useState, useEffect } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateReward, useUpdateReward } from "@/hooks/use-loyalty";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

const defaultForm = {
  name: "",
  description: "",
  pointsCost: 100,
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: 10,
};

export function RewardDialog({
  open,
  onOpenChange,
  programId,
  editData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  editData?: {
    id: string;
    name: string;
    description?: string | null;
    points_cost: number;
    discount_type: string;
    discount_value: number;
    is_active: boolean;
  } | null;
}) {
  const createReward = useCreateReward();
  const updateReward = useUpdateReward();
  const { t } = useTranslation();
  const isEdit = !!editData;
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (editData) {
      setForm({
        name: editData.name,
        description: editData.description || "",
        pointsCost: editData.points_cost,
        discountType: editData.discount_type as "percentage" | "fixed",
        discountValue: editData.discount_value,
      });
    } else {
      setForm(defaultForm);
    }
  }, [editData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEdit) {
      updateReward.mutate(
        {
          id: editData!.id,
          name: form.name,
          description: form.description || undefined,
          pointsCost: form.pointsCost,
          discountType: form.discountType,
          discountValue: form.discountValue,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            toast.success(t("loyalty.rewardUpdated"));
          },
          onError: (err) => toast.error(`Error: ${(err as Error).message}`),
        },
      );
    } else {
      createReward.mutate(
        {
          programId,
          name: form.name,
          description: form.description || undefined,
          pointsCost: form.pointsCost,
          discountType: form.discountType,
          discountValue: form.discountValue,
        },
        {
          onSuccess: () => {
            setForm(defaultForm);
            onOpenChange(false);
            toast.success(t("loyalty.rewardCreated"));
          },
          onError: (err) => toast.error(`Error: ${(err as Error).message}`),
        },
      );
    }
  }

  const isPending = createReward.isPending || updateReward.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("loyalty.editReward") : t("loyalty.createReward")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rwd-name">{t("loyalty.rewardName")} *</Label>
            <Input id="rwd-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rwd-desc">{t("loyalty.rewardDescription")}</Label>
            <Input id="rwd-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rwd-cost">{t("loyalty.pointsCost")}</Label>
            <Input id="rwd-cost" type="number" min={1} value={form.pointsCost} onChange={(e) => setForm((p) => ({ ...p, pointsCost: parseInt(e.target.value) || 1 }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rwd-dtype">{t("loyalty.discountType")}</Label>
            <Select value={form.discountType} onValueChange={(v) => setForm((p) => ({ ...p, discountType: v as "percentage" | "fixed" }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("loyalty.discountType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">{t("loyalty.percentage")}</SelectItem>
                <SelectItem value="fixed">{t("loyalty.fixed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rwd-dval">{t("loyalty.discountValue")}</Label>
            <Input id="rwd-dval" type="number" min={1} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: parseInt(e.target.value) || 1 }))} />
            <p className="text-xs text-muted-foreground">
              {form.discountType === "percentage" ? t("loyalty.discountValueHelpPercentage") : t("loyalty.discountValueHelpFixed")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isPending || !form.name}>
              {isPending ? t("common.saving") : isEdit ? t("common.save") : t("loyalty.createReward")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Re-export with old name for backward compat
export { RewardDialog as CreateRewardDialog };
