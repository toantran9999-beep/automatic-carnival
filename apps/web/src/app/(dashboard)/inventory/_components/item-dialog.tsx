"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import {
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useInventoryCategories,
} from "@/hooks/use-inventory";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

/** Giá trị cho ô "chưa phân nhóm" — Radix Select không nhận value rỗng. */
const NO_CATEGORY = "__none__";

const EMPTY = {
  name: "",
  unit: "g",
  currentStock: "",
  minStock: "",
  costPerUnit: "",
  barcode: "",
  packSize: "1",
  packLabel: "",
  categoryId: NO_CATEGORY,
};

/**
 * Tạo mới HOẶC sửa một nguyên liệu — `item` khác null là chế độ sửa.
 *
 * ⚠️ Chế độ sửa KHÔNG cho đụng vào tồn kho hiện tại: tồn chỉ được đổi qua phiếu
 * nhập/xuất/kiểm kê để mỗi thay đổi đều có một dòng lịch sử giải thích. Sửa thẳng ở
 * đây là mở đường cho tồn nhảy số mà không ai truy được vì sao.
 */
export function ItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: any | null;
}) {
  const { t, lang } = useTranslation();
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const { data: categoriesData } = useInventoryCategories();
  const categories: any[] = categoriesData ?? [];
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            name: item.name ?? "",
            unit: item.unit ?? "g",
            currentStock: "",
            minStock: String(parseFloat(item.min_stock ?? "0")),
            // ⚠️ Giá vốn lưu theo XU — chia 100 để hiện ra đồng.
            costPerUnit: item.cost_per_unit ? String(item.cost_per_unit / 100) : "",
            barcode: item.barcode ?? "",
            packSize: String(parseFloat(item.pack_size ?? "1")),
            packLabel: item.pack_label ?? "",
            categoryId: item.category_id ?? NO_CATEGORY,
          }
        : EMPTY,
    );
  }, [open, item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;

    const shared = {
      name: form.name,
      unit: form.unit,
      minStock: parseFloat(form.minStock) || 0,
      costPerUnit: Math.round(parseFloat(form.costPerUnit || "0") * 100),
      barcode: form.barcode.trim() || null,
      packSize: parseFloat(form.packSize) || 1,
      packLabel: form.packLabel.trim() || null,
    };

    try {
      if (isEdit) {
        await updateItem.mutateAsync({
          id: item.id,
          ...shared,
          // PATCH nhận null để gỡ nhóm; POST thì zod đòi uuid nên phải bỏ hẳn khoá.
          categoryId: form.categoryId === NO_CATEGORY ? null : form.categoryId,
        });
      } else {
        await createItem.mutateAsync({
          ...shared,
          currentStock: parseFloat(form.currentStock) || 0,
          ...(form.categoryId !== NO_CATEGORY ? { categoryId: form.categoryId } : {}),
        });
      }
      onOpenChange(false);
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  const pending = createItem.isPending || updateItem.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("common.edit") : t("inventory.addIngredient")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="itemName">{t("inventory.ingredientName")} *</Label>
            <Input
              id="itemName"
              placeholder={
                lang === "vi" ? "Ví dụ: Sữa đặc, Chanh, Ly nhựa 360ml..." : "e.g. Condensed milk, Lime..."
              }
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="itemCategory">{t("menu.category")}</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm({ ...form, categoryId: v })}
            >
              <SelectTrigger id="itemCategory">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>{t("inventory.noCategory")}</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemUnit">{lang === "vi" ? "Đơn vị" : "Unit"}</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger id="itemUnit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Kho đếm theo g/ml vì SOP viết theo g/ml — để kg/lít lên đầu là
                      mời người dùng nhập sai đơn vị so với công thức. */}
                  <SelectItem value="g">{lang === "vi" ? "Gam (g)" : "Grams (g)"}</SelectItem>
                  <SelectItem value="ml">{lang === "vi" ? "Mi-li-lít (ml)" : "Milliliters (ml)"}</SelectItem>
                  <SelectItem value="cái">{lang === "vi" ? "Cái" : "Piece"}</SelectItem>
                  <SelectItem value="túi">{lang === "vi" ? "Túi" : "Bag"}</SelectItem>
                  <SelectItem value="gói">{lang === "vi" ? "Gói" : "Packet"}</SelectItem>
                  <SelectItem value="trái">{lang === "vi" ? "Trái" : "Fruit"}</SelectItem>
                  <SelectItem value="hũ">{lang === "vi" ? "Hũ" : "Jar"}</SelectItem>
                  <SelectItem value="chai">{lang === "vi" ? "Chai" : "Bottle"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCost">
                {t("inventory.cost")} / {lang === "vi" ? "đơn vị (đ)" : "unit"}
              </Label>
              <Input
                id="itemCost"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0"
                value={form.costPerUnit}
                onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tồn ban đầu chỉ có lúc TẠO MỚI. Sửa tồn phải đi qua phiếu kho. */}
            {!isEdit && (
              <div className="space-y-2">
                <Label htmlFor="itemStock">
                  {lang === "vi" ? "Tồn kho ban đầu" : "Initial Stock"}
                </Label>
                <Input
                  id="itemStock"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.currentStock}
                  onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="itemMinStock">{t("inventory.minStock")}</Label>
              <Input
                id="itemMinStock"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemPackSize">{t("inventory.packHint")}</Label>
              <Input
                id="itemPackSize"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                value={form.packSize}
                onChange={(e) => setForm({ ...form, packSize: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemPackLabel">{lang === "vi" ? "Quy cách" : "Pack label"}</Label>
              <Input
                id="itemPackLabel"
                placeholder={lang === "vi" ? "lon 380g, bao 1kg..." : "can 380g, bag 1kg..."}
                value={form.packLabel}
                onChange={(e) => setForm({ ...form, packLabel: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="itemBarcode">{t("inventory.barcode")}</Label>
            <Input
              id="itemBarcode"
              autoComplete="off"
              placeholder={
                lang === "vi"
                  ? "Bỏ trống cũng được — hệ thống tự cấp mã nội bộ"
                  : "Optional — an internal code is issued automatically"
              }
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
            {isEdit && item?.internal_code && (
              <p className="font-mono text-xs text-muted-foreground">
                {t("inventory.internalCode")}: {item.internal_code}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={pending || !form.name}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
