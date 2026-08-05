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
import { DatePicker } from "@restai/ui/components/date-picker";
import { RefreshCw } from "lucide-react";
import { useCreateCoupon } from "@/hooks/use-coupons";
import { useMenuItems, useCategories } from "@/hooks/use-menu";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { formatCurrency } from "@/lib/utils";

/**
 * Đồng (chủ quán gõ) → xu (máy chủ lưu).
 *
 * ⚠️ Mọi ô nhập TIỀN trong app đều phải qua bước này — xem product-dialog.tsx và
 * shift-controls.tsx. Hộp thoại này trước đây gửi thẳng số nhập nên toàn bộ mã
 * giảm giá bị nhỏ đi 100 lần mà không có dấu hiệu nào báo sai.
 */
function vndToCents(vnd: number): number {
  return Math.round(vnd) * 100;
}

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "REST-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function CreateCouponDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createCoupon = useCreateCoupon();
  const { t } = useTranslation();
  const { data: menuItemsData } = useMenuItems();
  const { data: categoriesData } = useCategories();
  const menuItems: any[] = menuItemsData ?? [];
  const categories: any[] = categoriesData ?? [];
  const [form, setForm] = useState({
    code: generateCouponCode(),
    name: "",
    description: "",
    type: "percentage" as string,
    discountValue: 10,
    menuItemId: "",
    categoryId: "",
    buyQuantity: 2,
    getQuantity: 1,
    minOrderAmount: 0,
    maxDiscountAmount: 0,
    maxUsesTotal: 0,
    maxUsesPerCustomer: 1,
    startsAt: "",
    expiresAt: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      type: form.type,
    };

    if (["percentage", "fixed", "item_discount", "category_discount"].includes(form.type)) {
      // ⚠️ Chỉ "fixed" là SỐ TIỀN — quy đồng → xu như mọi ô tiền khác trong app
      // (xem product-dialog / shift-controls). Ba loại kia là phần trăm, để nguyên.
      //
      // Bản cũ gửi thẳng số nhập: chủ quán gõ 50000 định giảm 50.000đ thì máy chủ
      // hiểu là 50.000 xu = 500đ.
      payload.discountValue =
        form.type === "fixed" ? vndToCents(form.discountValue) : form.discountValue;
    }
    if (["item_free", "item_discount"].includes(form.type) && form.menuItemId) {
      payload.menuItemId = form.menuItemId;
    }
    if (form.type === "category_discount" && form.categoryId) {
      payload.categoryId = form.categoryId;
    }
    if (form.type === "buy_x_get_y") {
      payload.buyQuantity = form.buyQuantity;
      payload.getQuantity = form.getQuantity;
    }
    // Hai ngưỡng này cũng là tiền → xu. Bản cũ gửi thô nên "đơn từ 200.000đ" thành
    // "đơn từ 2.000đ" (mọi đơn đều thỏa) và "giảm tối đa 50.000đ" thành 500đ.
    if (form.minOrderAmount > 0) payload.minOrderAmount = vndToCents(form.minOrderAmount);
    if (form.maxDiscountAmount > 0) payload.maxDiscountAmount = vndToCents(form.maxDiscountAmount);
    if (form.maxUsesTotal > 0) payload.maxUsesTotal = form.maxUsesTotal;
    if (form.maxUsesPerCustomer > 0) payload.maxUsesPerCustomer = form.maxUsesPerCustomer;
    if (form.startsAt) payload.startsAt = form.startsAt;
    if (form.expiresAt) payload.expiresAt = form.expiresAt;

    createCoupon.mutate(payload, {
      onSuccess: () => {
        setForm({
          code: generateCouponCode(),
          name: "",
          description: "",
          type: "percentage",
          discountValue: 10,
          menuItemId: "",
          categoryId: "",
          buyQuantity: 2,
          getQuantity: 1,
          minOrderAmount: 0,
          maxDiscountAmount: 0,
          maxUsesTotal: 0,
          maxUsesPerCustomer: 1,
          startsAt: "",
          expiresAt: "",
        });
        onOpenChange(false);
        toast.success(t("loyalty.couponCreated"));
      },
      onError: (err) => toast.error(`Error: ${(err as Error).message}`),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("loyalty.addCoupon")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="cpn-code">{t("loyalty.couponCode")}</Label>
            <div className="flex gap-2">
              <Input id="cpn-code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} required />
              <Button type="button" variant="outline" size="icon" onClick={() => setForm((p) => ({ ...p, code: generateCouponCode() }))}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="cpn-name">{t("loyalty.couponName")} *</Label>
            <Input id="cpn-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Ej: 10% Off" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="cpn-desc">{t("loyalty.couponDescription")}</Label>
            <Input id="cpn-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="cpn-type">{t("loyalty.couponType")}</Label>
            <Select value={form.type} onValueChange={(v) => setForm((p) => ({
              ...p,
              type: v,
              discountValue: (v === "percentage" || v === "item_discount" || v === "category_discount") ? 10 : 0,
              menuItemId: "",
              categoryId: "",
              buyQuantity: 2,
              getQuantity: 1,
            }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("loyalty.couponType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">{t("loyalty.couponTypePercentage")}</SelectItem>
                <SelectItem value="fixed">{t("loyalty.couponTypeFixed")}</SelectItem>
                <SelectItem value="item_free">{t("loyalty.couponTypeItemFree")}</SelectItem>
                <SelectItem value="item_discount">{t("loyalty.couponTypeItemDiscount")}</SelectItem>
                <SelectItem value="category_discount">{t("loyalty.couponTypeCategoryDiscount")}</SelectItem>
                <SelectItem value="buy_x_get_y">{t("loyalty.couponTypeBuyXGetY")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific fields */}
          {form.type === "percentage" && (
            <div className="space-y-2">
              <Label htmlFor="cpn-pct">{t("loyalty.discountPercent")}</Label>
              <Input id="cpn-pct" type="number" min={1} max={100} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: parseInt(e.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground">{t("loyalty.discountValueHelpPercentage")}</p>
            </div>
          )}

          {form.type === "fixed" && (
            <div className="space-y-2">
              <Label htmlFor="cpn-fixed">{t("loyalty.discountValue")}</Label>
              <Input id="cpn-fixed" type="number" min={1} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: parseInt(e.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground">{t("loyalty.discountValueHelpFixed")}</p>
            </div>
          )}

          {(form.type === "item_discount" || form.type === "item_free") && (
            <div className="space-y-2">
              <Label>{t("loyalty.menuItem")} *</Label>
              <Select value={form.menuItemId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, menuItemId: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("loyalty.selectReward")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("loyalty.selectReward")}</SelectItem>
                  {menuItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — {formatCurrency(item.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.type === "item_discount" && (
            <div className="space-y-2">
              <Label htmlFor="cpn-dv">{t("loyalty.discountPercent")}</Label>
              <Input id="cpn-dv" type="number" min={1} max={100} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: parseInt(e.target.value) || 0 }))} />
            </div>
          )}

          {form.type === "category_discount" && (
            <>
              <div className="space-y-2">
                <Label>{t("loyalty.category")} *</Label>
                <Select value={form.categoryId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("loyalty.category")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("loyalty.category")}</SelectItem>
                    {categories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpn-dv-cat">{t("loyalty.discountPercent")}</Label>
                <Input id="cpn-dv-cat" type="number" min={1} max={100} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: parseInt(e.target.value) || 0 }))} />
              </div>
            </>
          )}

          {form.type === "buy_x_get_y" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpn-bx">{t("loyalty.buyQty")}</Label>
                <Input id="cpn-bx" type="number" min={1} value={form.buyQuantity} onChange={(e) => setForm((p) => ({ ...p, buyQuantity: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpn-gy">{t("loyalty.getQty")}</Label>
                <Input id="cpn-gy" type="number" min={1} value={form.getQuantity} onChange={(e) => setForm((p) => ({ ...p, getQuantity: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
          )}

          {/* Common limits */}
          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-sm font-medium text-foreground">{t("loyalty.restrictions")}</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpn-min">{t("loyalty.minOrderAmount")}</Label>
                <Input id="cpn-min" type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpn-maxd">{t("loyalty.maxDiscountAmount")}</Label>
                <Input id="cpn-maxd" type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm((p) => ({ ...p, maxDiscountAmount: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpn-uses">{t("loyalty.maxUsesTotal")}</Label>
                <Input id="cpn-uses" type="number" min={0} value={form.maxUsesTotal} onChange={(e) => setForm((p) => ({ ...p, maxUsesTotal: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpn-upc">{t("loyalty.maxUsesPerCustomer")}</Label>
                <Input id="cpn-upc" type="number" min={1} value={form.maxUsesPerCustomer} onChange={(e) => setForm((p) => ({ ...p, maxUsesPerCustomer: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("loyalty.startDate")}</Label>
                <DatePicker
                  value={form.startsAt}
                  onChange={(v) => setForm((p) => ({ ...p, startsAt: v ?? "" }))}
                  placeholder={t("loyalty.selectReward")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("loyalty.endDate")}</Label>
                <DatePicker
                  value={form.expiresAt}
                  onChange={(v) => setForm((p) => ({ ...p, expiresAt: v ?? "" }))}
                  placeholder={t("loyalty.selectReward")}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button
              type="submit"
              disabled={
                createCoupon.isPending ||
                !form.name ||
                !form.code ||
                (["item_free", "item_discount"].includes(form.type) && !form.menuItemId) ||
                (form.type === "category_discount" && !form.categoryId)
              }
            >
              {createCoupon.isPending ? t("common.saving") : t("loyalty.addCoupon")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
