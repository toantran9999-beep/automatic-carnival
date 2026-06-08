"use client";

import { useState } from "react";
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
import { useCreateMovement } from "@/hooks/use-inventory";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

export function CreateMovementDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
}) {
  const { t, lang } = useTranslation();
  const createMovement = useCreateMovement();
  const [form, setForm] = useState({
    itemId: "none",
    type: "purchase",
    quantity: "",
    reference: "",
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || form.itemId === "none" || !form.quantity) return;
    try {
      await createMovement.mutateAsync({
        itemId: form.itemId,
        type: form.type,
        quantity: parseFloat(form.quantity),
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      setForm({
        itemId: "none",
        type: "purchase",
        quantity: "",
        reference: "",
        notes: "",
      });
      onOpenChange(false);
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inventory.addMovement")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="movItem">{lang === "vi" ? "Nguyên liệu" : "Ingredient"} *</Label>
            <Select
              value={form.itemId}
              onValueChange={(v) => setForm({ ...form, itemId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={lang === "vi" ? "Chọn nguyên liệu..." : "Select ingredient..."} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit}) - Stock:{" "}
                    {parseFloat(item.current_stock).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="movType">{t("inventory.movementType")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang === "vi" ? "Chọn loại..." : "Select type..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">{lang === "vi" ? "Nhập hàng" : "Purchase"}</SelectItem>
                  <SelectItem value="consumption">{lang === "vi" ? "Tiêu hao" : "Consumption"}</SelectItem>
                  <SelectItem value="waste">{lang === "vi" ? "Hao hụt" : "Waste"}</SelectItem>
                  <SelectItem value="adjustment">{lang === "vi" ? "Điều chỉnh" : "Adjustment"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="movQty">{t("common.quantity")} *</Label>
              <Input
                id="movQty"
                type="number"
                step="0.001"
                placeholder="0"
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="movRef">{lang === "vi" ? "Tham chiếu / Lý do" : "Reference"}</Label>
            <Input
              id="movRef"
              placeholder={lang === "vi" ? "Số hóa đơn, nhà cung cấp, v.v..." : "Invoice number, supplier, etc."}
              value={form.reference}
              onChange={(e) =>
                setForm({ ...form, reference: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movNotes">{t("pos.notes") || "Notas"}</Label>
            <Input
              id="movNotes"
              placeholder={lang === "vi" ? "Ghi chú thêm..." : "Observations..."}
              value={form.notes}
              onChange={(e) =>
                setForm({ ...form, notes: e.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                createMovement.isPending || !form.itemId || form.itemId === "none" || !form.quantity
              }
            >
              {createMovement.isPending
                ? t("common.saving")
                : t("inventory.addMovement")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
