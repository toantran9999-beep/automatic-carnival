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
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateProgram, useUpdateProgram } from "@/hooks/use-loyalty";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { formatCurrency } from "@/lib/utils";

export function ProgramDialog({
  open,
  onOpenChange,
  editData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}) {
  const { t, lang } = useTranslation();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const isEdit = !!editData;

  const [form, setForm] = useState({
    name: editData?.name || (lang === "vi" ? "Chương trình tích điểm" : "Points Program"),
    pointsPerCurrencyUnit: editData?.points_per_currency_unit || 1,
    currencyPerPoint: editData?.currency_per_point || 100,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      pointsPerCurrencyUnit: form.pointsPerCurrencyUnit,
      currencyPerPoint: form.currencyPerPoint,
      isActive: true,
    };

    const mutation = isEdit ? updateProgram : createProgram;
    const data = isEdit ? { id: editData.id, ...payload } : payload;

    mutation.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success(isEdit ? (lang === "vi" ? "Đã cập nhật chương trình" : "Program updated") : (lang === "vi" ? "Tạo chương trình thành công" : "Program created successfully"));
      },
      onError: (err) => toast.error(`${t("common.error")}: ${(err as Error).message}`),
    });
  }

  // Points simulator
  const exampleSpend = form.pointsPerCurrencyUnit > 0 && form.currencyPerPoint > 1000 ? 50000 : 50;
  const pointsEarned = exampleSpend * form.pointsPerCurrencyUnit;
  const pointValue = form.currencyPerPoint / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? (lang === "vi" ? "Sửa chương trình" : "Edit Program")
              : (lang === "vi" ? "Tạo chương trình tích điểm" : "Create Points Program")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prog-name">{lang === "vi" ? "Tên chương trình" : "Program Name"}</Label>
            <Input id="prog-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-ppu">{lang === "vi" ? "Điểm cho mỗi đơn vị chi tiêu" : "Points per unit spent"}</Label>
            <Input
              id="prog-ppu"
              type="number"
              min={1}
              value={form.pointsPerCurrencyUnit}
              onChange={(e) => setForm((p) => ({ ...p, pointsPerCurrencyUnit: parseInt(e.target.value) || 1 }))}
            />
            <p className="text-xs text-muted-foreground">
              {lang === "vi" ? `Số điểm khách hàng nhận được cho mỗi ${formatCurrency(100)} chi tiêu` : `How many points the customer earns for each ${formatCurrency(100)} spent`}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-cpp">{lang === "vi" ? "Giá trị quy đổi (xu/cent)" : "Point value (cents)"}</Label>
            <Input
              id="prog-cpp"
              type="number"
              min={1}
              value={form.currencyPerPoint}
              onChange={(e) => setForm((p) => ({ ...p, currencyPerPoint: parseInt(e.target.value) || 100 }))}
            />
            <p className="text-xs text-muted-foreground">
              {lang === "vi" ? `Giá trị quy đổi điểm sang tiền tệ (100 điểm = ${formatCurrency(100 * form.currencyPerPoint)})` : `Value of each point when redeeming (100 pts = ${formatCurrency(100 * form.currencyPerPoint)})`}
            </p>
          </div>

          {/* Simulator */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">{lang === "vi" ? "Bản xem trước" : "Preview"}</p>
            <p className="text-xs text-muted-foreground">
              {lang === "vi" ? (
                <>Nếu khách chi tiêu <span className="font-bold text-foreground">{formatCurrency(exampleSpend * 100)}</span>, nhận <span className="font-bold text-primary">{pointsEarned} điểm</span>.</>
              ) : (
                <>If your customer spends <span className="font-bold text-foreground">{formatCurrency(exampleSpend * 100)}</span>, they earn <span className="font-bold text-primary">{pointsEarned} points</span>.</>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "vi" ? (
                <>Với <span className="font-bold text-foreground">100 điểm</span> tích lũy, có thể đổi <span className="font-bold text-primary">{formatCurrency(100 * form.currencyPerPoint)}</span> giảm giá.</>
              ) : (
                <>With <span className="font-bold text-foreground">100 points</span>, they can redeem <span className="font-bold text-primary">{formatCurrency(100 * form.currencyPerPoint)}</span> in discounts.</>
              )}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createProgram.isPending || updateProgram.isPending}>
              {(createProgram.isPending || updateProgram.isPending)
                ? t("common.saving")
                : isEdit
                ? (lang === "vi" ? "Lưu thay đổi" : "Save Changes")
                : (lang === "vi" ? "Tạo chương trình" : "Create Program")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
