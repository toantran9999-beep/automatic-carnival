"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Plus, X } from "lucide-react";
import { useCreateRecipe, useRecipe } from "@/hooks/use-inventory";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

type BaseRow = { inventoryItemId: string; quantityUsed: string };
/** Một dòng chênh: tùy chọn nào, nguyên liệu nào, cộng/trừ bao nhiêu. */
type ModRow = { modifierId: string; inventoryItemId: string; quantityDelta: string };

/**
 * Cấu hình công thức cho MỘT món: phần nền + phần chênh theo tùy chọn.
 *
 * Trước đây hộp thoại này bắt dán UUID món ăn vào ô text — không ai dùng nổi. Nay
 * món được chọn từ danh sách ở tab Định lượng và truyền vào qua `menuItem`.
 */
export function RecipeDialog({
  open,
  onOpenChange,
  menuItem,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItem: { id: string; name: string } | null;
  items: any[];
}) {
  const { t } = useTranslation();
  const createRecipe = useCreateRecipe();
  const { data: recipeData, isLoading } = useRecipe(open ? (menuItem?.id ?? "") : "");

  const [base, setBase] = useState<BaseRow[]>([{ inventoryItemId: "", quantityUsed: "" }]);
  const [mods, setMods] = useState<ModRow[]>([]);

  const ingredients: any[] = recipeData?.ingredients ?? [];
  const modifierRows: any[] = recipeData?.modifiers ?? [];

  /** Tùy chọn của món, gom theo nhóm — mỗi tùy chọn hiện một lần dù có 0 hay N dòng chênh. */
  const modifiers = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; group: string }>();
    for (const r of modifierRows) {
      if (!byId.has(r.modifier_id)) {
        byId.set(r.modifier_id, {
          id: r.modifier_id,
          name: r.modifier_name,
          group: r.group_name,
        });
      }
    }
    return [...byId.values()];
  }, [modifierRows]);

  // Nạp lại form mỗi lần mở món khác. Chỉ chạy khi dữ liệu về, để không đè mất
  // những gì người dùng vừa gõ.
  useEffect(() => {
    if (!open || !recipeData) return;
    setBase(
      ingredients.length > 0
        ? ingredients.map((i: any) => ({
            inventoryItemId: i.inventory_item_id,
            quantityUsed: String(parseFloat(i.quantity_used)),
          }))
        : [{ inventoryItemId: "", quantityUsed: "" }],
    );
    setMods(
      modifierRows
        // `replaces_item_id` = phép đổi loại hạt, chỉnh ở mục "Lô hạt đang dùng"
        // chứ không phải ở đây — hiện lẫn vào chỉ làm người dùng sửa nhầm.
        .filter((r: any) => r.inventory_item_id && !r.replaces_item_id)
        .map((r: any) => ({
          modifierId: r.modifier_id,
          inventoryItemId: r.inventory_item_id,
          quantityDelta: String(parseFloat(r.quantity_delta)),
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipeData]);

  function updateBase(index: number, field: keyof BaseRow, value: string) {
    setBase((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function updateMod(index: number, field: keyof ModRow, value: string) {
    setMods((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!menuItem) return;

    const validBase = base.filter((i) => i.inventoryItemId && i.quantityUsed);
    if (validBase.length === 0) return;

    // Delta = 0 là không chênh gì cả — ghi vào chỉ tốn dòng, nhưng KHÔNG lọc số âm:
    // "Ít ngọt −3g" chính là dạng phổ biến nhất ở đây.
    const validMods = mods.filter(
      (m) => m.modifierId && m.inventoryItemId && parseFloat(m.quantityDelta),
    );

    try {
      await createRecipe.mutateAsync({
        menuItemId: menuItem.id,
        ingredients: validBase.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          quantityUsed: parseFloat(i.quantityUsed),
        })),
        modifierIngredients: validMods.map((m) => ({
          modifierId: m.modifierId,
          inventoryItemId: m.inventoryItemId,
          quantityDelta: parseFloat(m.quantityDelta),
        })),
      });
      onOpenChange(false);
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  const itemName = (id: string) => items.find((i: any) => i.id === id)?.name ?? "";
  const itemUnit = (id: string) => items.find((i: any) => i.id === id)?.unit ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-x-hidden: khoá một chiều overflow là chiều kia tự thành auto, và
          trượt ngang sẽ cắt cụt chữ mà không báo gì. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{menuItem?.name ?? t("inventory.recipeDetails")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* --- Công thức nền --- */}
            <div className="space-y-2">
              <Label>{t("inventory.recipeBase")}</Label>
              {base.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={row.inventoryItemId || "none"}
                    onValueChange={(v) =>
                      updateBase(index, "inventoryItemId", v === "none" ? "" : v)
                    }
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue placeholder={t("inventory.items")} />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item: any) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    step="0.001"
                    min="0"
                    inputMode="decimal"
                    placeholder={t("inventory.quantity")}
                    value={row.quantityUsed}
                    onChange={(e) => updateBase(index, "quantityUsed", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={() =>
                      setBase((rows) =>
                        rows.length <= 1 ? rows : rows.filter((_, i) => i !== index),
                      )
                    }
                    disabled={base.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setBase((rows) => [...rows, { inventoryItemId: "", quantityUsed: "" }])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("inventory.addIngredientRow")}
              </Button>
            </div>

            {/* --- Phần chênh theo tùy chọn --- */}
            {modifiers.length > 0 && (
              <div className="space-y-2">
                <Label>{t("inventory.recipeByModifier")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("inventory.recipeModifierHelp")}
                </p>

                {mods.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={row.modifierId || "none"}
                      onValueChange={(v) =>
                        updateMod(index, "modifierId", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {modifiers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.group} — {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.inventoryItemId || "none"}
                      onValueChange={(v) =>
                        updateMod(index, "inventoryItemId", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder={t("inventory.items")} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item: any) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-24 shrink-0"
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      placeholder="±"
                      value={row.quantityDelta}
                      onChange={(e) => updateMod(index, "quantityDelta", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      onClick={() => setMods((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setMods((rows) => [
                      ...rows,
                      {
                        modifierId: modifiers[0]?.id ?? "",
                        inventoryItemId: "",
                        quantityDelta: "",
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("inventory.recipeByModifier")}
                </Button>
              </div>
            )}

            {/* Ba nút trở lên thì xếp DỌC — DialogFooter dùng `sm:flex-row` đo theo
                MÀN HÌNH nên trên máy POS màn rộng nó xếp ngang rồi tràn ra ngoài. */}
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={createRecipe.isPending}>
                {createRecipe.isPending ? t("common.saving") : t("common.save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
