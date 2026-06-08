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
import { useCreateInventoryItem } from "@/hooks/use-inventory";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

export function CreateItemDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const createItem = useCreateInventoryItem();
  const [form, setForm] = useState({
    name: "",
    unit: "kg",
    currentStock: "",
    minStock: "",
    costPerUnit: "",
    category: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    try {
      await createItem.mutateAsync({
        name: form.name,
        unit: form.unit,
        currentStock: parseFloat(form.currentStock) || 0,
        minStock: parseFloat(form.minStock) || 0,
        costPerUnit: Math.round(parseFloat(form.costPerUnit || "0") * 100),
        category: form.category || undefined,
      });
      setForm({
        name: "",
        unit: "kg",
        currentStock: "",
        minStock: "",
        costPerUnit: "",
        category: "",
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
          <DialogTitle>{t("inventory.addIngredient")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="itemName">{t("common.name")} *</Label>
            <Input
              id="itemName"
              placeholder={lang === "vi" ? "Ví dụ: Gạo, Thịt gà, Dầu ăn..." : "e.g. Rice, Chicken, Oil..."}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="itemCategory">{t("menu.category")}</Label>
            <Input
              id="itemCategory"
              placeholder={lang === "vi" ? "Ví dụ: Thịt, Rau củ, Sữa..." : "e.g. Meats, Vegetables, Dairy..."}
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemUnit">{lang === "vi" ? "Đơn vị" : "Unit"}</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => setForm({ ...form, unit: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang === "vi" ? "Chọn đơn vị..." : "Select unit..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">{lang === "vi" ? "Ki-lô-gam (kg)" : "Kilograms (kg)"}</SelectItem>
                  <SelectItem value="g">{lang === "vi" ? "Gam (g)" : "Grams (g)"}</SelectItem>
                  <SelectItem value="lt">{lang === "vi" ? "Lít (l)" : "Liters (lt)"}</SelectItem>
                  <SelectItem value="ml">{lang === "vi" ? "Mi-li-lít (ml)" : "Milliliters (ml)"}</SelectItem>
                  <SelectItem value="und">{lang === "vi" ? "Đơn vị (chiếc)" : "Units (pcs)"}</SelectItem>
                  <SelectItem value="paq">{lang === "vi" ? "Gói (gói)" : "Packets (pkg)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCost">{t("inventory.cost")} / {lang === "vi" ? "đơn vị" : "unit"} ({lang === "vi" ? "đ" : "$"})</Label>
              <Input
                id="itemCost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.costPerUnit}
                onChange={(e) =>
                  setForm({ ...form, costPerUnit: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemStock">{lang === "vi" ? "Tồn kho ban đầu" : "Initial Stock"}</Label>
              <Input
                id="itemStock"
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={form.currentStock}
                onChange={(e) =>
                  setForm({ ...form, currentStock: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemMinStock">{t("inventory.minStock")}</Label>
              <Input
                id="itemMinStock"
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={form.minStock}
                onChange={(e) =>
                  setForm({ ...form, minStock: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={createItem.isPending || !form.name}>
              {createItem.isPending ? t("staff.creating") : t("inventory.addIngredient")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
