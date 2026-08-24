"use client";

import { useState, useEffect } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Badge } from "@restai/ui/components/badge";
import { Check, ChevronDown, Plus, Minus, Loader2, UtensilsCrossed } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toThumbUrl } from "@/lib/image-thumb";
import { useItemModifierGroups } from "@/hooks/use-menu";
import { useTranslation } from "@/stores/lang-store";
import { modifierLabel } from "@restai/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartModifier {
  /**
   * null khi tùy chọn đã bị xóa khỏi thực đơn — đơn cũ vẫn giữ tên & giá (snapshot)
   * để in hóa đơn, nhưng không gọi lại được nữa (xem `toOrderItems` ở pos/page).
   */
  modifierId: string | null;
  name: string;
  /** Phụ trội mỗi đơn vị, tính bằng xu. Âm = giảm giá. */
  price: number;
  /**
   * Con số nhân viên gõ với tùy chọn kiểu số ("Đường 13g"). null/undefined với
   * tùy chọn bấm chọn bình thường.
   */
  value?: number | null;
  /** Đơn vị của con số trên ("g", "ml", "shot") — để ghép tên hiển thị. */
  unit?: string | null;
}

// ---------------------------------------------------------------------------
// ModifierDialog
// ---------------------------------------------------------------------------

export function ModifierDialog({
  item,
  open,
  onClose,
  onAdd,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
  onAdd: (item: any, qty: number, mods: CartModifier[], notes: string) => void;
}) {
  const { data: groups, isLoading } = useItemModifierGroups(item?.id ?? "");
  const modifierGroups: any[] = groups ?? [];
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Record<string, string[]>>({});
  /** modifierId -> con số nhân viên đang gõ (giữ dạng chuỗi để gõ dở "1." không bị nhảy). */
  const [values, setValues] = useState<Record<string, string>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelected({});
      setValues({});
      setOpenGroups({});
      setQuantity(1);
      setNotes("");
    }
  }, [open]);

  // Auto-add if no modifier groups
  useEffect(() => {
    if (!isLoading && modifierGroups.length === 0 && open && item) {
      onAdd(item, 1, [], "");
      onClose();
    }
  }, [isLoading, modifierGroups.length, open, item]);

  // Tự chọn mặc định: nhóm BẮT BUỘC + chọn-1 → chọn sẵn tùy chọn đầu tiên (option chuẩn).
  useEffect(() => {
    if (!open || isLoading || modifierGroups.length === 0) return;
    setSelected((prev) => {
      if (Object.keys(prev).length > 0) return prev; // đã có lựa chọn, không đụng
      const init: Record<string, string[]> = {};
      for (const g of modifierGroups) {
        if (g.is_required && g.max_selections === 1) {
          const first = (g.modifiers || []).find((m: any) => m.is_available !== false);
          if (first) init[g.id] = [first.id];
        }
      }
      return init;
    });
  }, [open, isLoading, modifierGroups.length]);

  if (!item) return null;

  // If no modifier groups, the useEffect above handles auto-add
  if (!isLoading && modifierGroups.length === 0) return null;

  /** Tra một tùy chọn theo id (dùng cho phần kiểm và phần dựng giỏ). */
  const findModifier = (modId: string): any => {
    for (const g of modifierGroups) {
      const found = (g.modifiers || []).find((m: any) => m.id === modId);
      if (found) return found;
    }
    return null;
  };

  /** Con số đã gõ, đã chuẩn hoá. NaN = chưa gõ gì hợp lệ. */
  const numericValue = (modId: string): number => {
    const raw = (values[modId] ?? "").replace(",", ".").trim();
    return raw === "" ? NaN : Number(raw);
  };

  const toggleModifier = (groupId: string, modId: string, maxSelections: number, isSingle: boolean) => {
    // Chọn tùy chọn kiểu số thì điền sẵn liều mặc định — nhân viên chỉ sửa khi khách đòi khác.
    const mod = findModifier(modId);
    if (mod?.input_type === "number" && values[modId] === undefined) {
      const preset = mod.default_value;
      setValues((prev) => ({
        ...prev,
        [modId]: preset === null || preset === undefined ? "" : String(parseFloat(preset)),
      }));
    }
    setSelected((prev) => {
      const curr = prev[groupId] || [];
      if (isSingle) {
        return { ...prev, [groupId]: curr.includes(modId) ? [] : [modId] };
      }
      if (curr.includes(modId)) {
        return { ...prev, [groupId]: curr.filter((id) => id !== modId) };
      }
      if (maxSelections && curr.length >= maxSelections) return prev;
      return { ...prev, [groupId]: [...curr, modId] };
    });
  };

  const modifiersTotal = Object.entries(selected).reduce((sum, [groupId, modIds]) => {
    const group = modifierGroups.find((g: any) => g.id === groupId);
    if (!group) return sum;
    return sum + modIds.reduce((ms, modId) => {
      const mod = group.modifiers.find((m: any) => m.id === modId);
      return ms + (mod?.price || 0);
    }, 0);
  }, 0);

  const lineTotal = (item.price + modifiersTotal) * quantity;

  const hasRequiredErrors = modifierGroups.some((g: any) => {
    if (!g.is_required) return false;
    const sel = selected[g.id] || [];
    return sel.length < (g.min_selections || 1);
  });

  /**
   * Đã chọn mục gõ số mà ô trống hoặc ngoài khoảng → khoá nút xác nhận.
   * Máy chủ cũng chặn lần nữa; ở đây chặn sớm để nhân viên khỏi bấm rồi mới báo lỗi.
   */
  const invalidNumericIds = Object.values(selected)
    .flat()
    .filter((modId) => {
      const mod = findModifier(modId);
      if (mod?.input_type !== "number") return false;
      const v = numericValue(modId);
      if (!Number.isFinite(v)) return true;
      const min = mod.min_value === null || mod.min_value === undefined ? null : Number(mod.min_value);
      const max = mod.max_value === null || mod.max_value === undefined ? null : Number(mod.max_value);
      return (min !== null && v < min) || (max !== null && v > max);
    });
  const hasNumericErrors = invalidNumericIds.length > 0;

  const handleConfirm = () => {
    const cartMods: CartModifier[] = [];
    for (const [groupId, modIds] of Object.entries(selected)) {
      const group = modifierGroups.find((g: any) => g.id === groupId);
      if (!group) continue;
      for (const modId of modIds) {
        const mod = group.modifiers.find((m: any) => m.id === modId);
        if (!mod) continue;
        const isNumeric = mod.input_type === "number";
        const value = isNumeric ? numericValue(mod.id) : null;
        cartMods.push({
          modifierId: mod.id,
          name: mod.name,
          price: mod.price || 0,
          value: isNumeric && Number.isFinite(value as number) ? (value as number) : null,
          unit: mod.unit ?? null,
        });
      }
    }
    onAdd(item, quantity, cartMods, notes);
    onClose();
  };

  return (
    <Dialog open={open && (isLoading || modifierGroups.length > 0)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {item.image_url ? (
              <img
                src={toThumbUrl(item.image_url)}
                alt=""
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = item.image_url!;
                }}
                className="h-12 w-12 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate">{item.name}</p>
              <p className="text-sm font-normal text-primary">{formatCurrency(item.price)}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Modifier groups */}
            {modifierGroups.map((group: any) => {
              const isSingle = group.max_selections === 1;
              const sel = selected[group.id] || [];
              const isOpen = openGroups[group.id] !== false;
              const selCount = sel.length;

              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))
                    }
                    className="flex min-h-11 w-full items-center justify-between mb-1"
                  >
                    <p className="text-base font-semibold">
                      {group.name}
                      {group.is_required && (
                        <span className="ml-1.5 text-xs font-normal text-destructive">
                          * {t("menu.required")}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      {!isOpen && selCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selCount} {t("common.actions") !== "Actions" ? "đã chọn" : "sel."}
                        </Badge>
                      )}
                      {group.max_selections > 1 && (
                        <span className="text-xs text-muted-foreground">
                          Max {group.max_selections}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </div>
                  </button>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                    }}
                    className="transition-all duration-200"
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-1">
                        {(group.modifiers || []).filter((m: any) => m.is_available !== false).map((mod: any) => {
                          const isSelected = sel.includes(mod.id);
                          const isNumeric = mod.input_type === "number";
                          const badValue = isSelected && invalidNumericIds.includes(mod.id);
                          return (
                            <div key={mod.id}>
                            <button
                              type="button"
                              onClick={() => toggleModifier(group.id, mod.id, group.max_selections, isSingle)}
                              className={`w-full flex min-h-12 items-center justify-between rounded-lg border px-3 py-3 text-base transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center ${
                                    isSingle ? "rounded-full" : "rounded"
                                  } border-2 transition-colors ${
                                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                                  )}
                                </div>
                                <span className={isSelected ? "font-medium" : ""}>{mod.name}</span>
                              </div>
                              {mod.price !== 0 && (
                                <span className={cn(
                                  "text-sm font-medium",
                                  mod.price > 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {mod.price > 0 ? "+" : "−"}{formatCurrency(Math.abs(mod.price))}
                                </span>
                              )}
                            </button>

                            {/* Ô gõ số — chỉ hiện khi đã chọn mục kiểu số. Nằm NGOÀI
                                <button> ở trên: lồng input vào button thì bấm vào ô
                                sẽ kích hoạt nút và tự bỏ chọn ngay. */}
                            {isNumeric && isSelected && (
                              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                                <Input
                                  autoFocus
                                  type="text"
                                  inputMode="decimal"
                                  value={values[mod.id] ?? ""}
                                  onChange={(e) =>
                                    setValues((prev) => ({ ...prev, [mod.id]: e.target.value }))
                                  }
                                  placeholder={
                                    mod.default_value != null ? String(parseFloat(mod.default_value)) : "0"
                                  }
                                  className={cn(
                                    "h-11 w-24 text-base font-semibold tabular-nums",
                                    badValue && "border-destructive",
                                  )}
                                />
                                {mod.unit && (
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {mod.unit}
                                  </span>
                                )}
                                <span className="ml-auto text-xs leading-snug text-muted-foreground">
                                  {mod.min_value != null && mod.max_value != null
                                    ? `${parseFloat(mod.min_value)}–${parseFloat(mod.max_value)}${mod.unit ?? ""}`
                                    : t("pos.enterAmount", "Nhập số")}
                                </span>
                              </div>
                            )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div>
              <p className="text-sm font-semibold mb-1.5">{t("pos.notes")}</p>
              <Input
                placeholder={t("pos.notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-11 text-base"
              />
            </div>
          </div>
        )}

        {!isLoading && modifierGroups.length > 0 && (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {/* Quantity */}
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-medium text-muted-foreground">{t("pos.quantity")}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-lg"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4.5 w-4.5" />
                </Button>
                <span className="w-9 text-center text-lg font-bold">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-lg"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>
            <Button
              className="w-full h-12 text-base font-semibold"
              disabled={hasRequiredErrors || hasNumericErrors}
              onClick={handleConfirm}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("pos.addToCart")} · {formatCurrency(lineTotal)}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
