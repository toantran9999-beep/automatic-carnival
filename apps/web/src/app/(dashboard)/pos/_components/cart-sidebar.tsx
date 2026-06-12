"use client";

import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import {
  ShoppingCart,
  User,
  Plus,
  Minus,
  Trash2,
  Check,
  Loader2,
  UtensilsCrossed,
  Printer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import { useBranchSettings } from "@/hooks/use-settings";
import type { PosCartItem } from "../page";

export function CartSidebar({
  cart,
  orderType,
  customerName,
  orderNotes,
  isPending,
  tableId,
  tableNumber,
  tables = [],
  onTableSelect,
  onTableClear,
  onOrderTypeChange,
  onCustomerNameChange,
  onOrderNotesChange,
  onUpdateQty,
  onRemove,
  onClearCart,
  onCreateOrder,
  onPrintTemporaryBill,
  activeSession,
  onPayUnpaidOrders,
  className,
}: {
  cart: PosCartItem[];
  orderType: "dine_in" | "takeout";
  customerName: string;
  orderNotes: string;
  isPending: boolean;
  tableId: string | null;
  tableNumber: string | null;
  tables?: any[];
  onTableSelect?: (id: string, number: number) => void;
  onTableClear?: () => void;
  onOrderTypeChange: (type: "dine_in" | "takeout") => void;
  onCustomerNameChange: (name: string) => void;
  onOrderNotesChange: (notes: string) => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClearCart: () => void;
  onCreateOrder: (payImmediately: boolean) => void;
  onPrintTemporaryBill: () => void;
  activeSession?: any;
  onPayUnpaidOrders?: () => void;
  className?: string;
}) {
  const { t, lang } = useTranslation();
  const { data: branchSettings } = useBranchSettings();
  const taxRate = branchSettings?.tax_rate ?? 1000;

  const subtotal = cart.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.unitPrice + modTotal) * item.quantity;
  }, 0);
  const total = subtotal;
  const tax = Math.round(total - total / (1 + taxRate / 10000));
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const unpaidOrders =
    activeSession?.orders?.filter(
      (o: any) => o.status !== "completed" && o.status !== "cancelled"
    ) || [];
  const hasUnpaid = unpaidOrders.length > 0;
  const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);

  const allOrderedItems = unpaidOrders.flatMap(
    (order: any) =>
      order.items?.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        notes: item.notes,
        modifiers: item.modifiers || [],
      })) || []
  );

  return (
    <div className={className ?? "w-[340px] flex flex-col border-l pl-3"}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShoppingCart className="h-4 w-4" />
          {t("pos.cartTitle")}
          {totalQty > 0 && (
            <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[11px]">
              {totalQty}
            </Badge>
          )}
        </h2>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-destructive"
            onClick={onClearCart}
          >
            {t("pos.clear")}
          </Button>
        )}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
        <Button
          variant={orderType === "dine_in" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs font-semibold"
          onClick={() => onOrderTypeChange("dine_in")}
        >
          {t("pos.dineIn")}
        </Button>
        <Button
          variant={orderType === "takeout" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs font-semibold"
          onClick={() => onOrderTypeChange("takeout")}
        >
          {t("pos.takeaway")}
        </Button>
      </div>

      {orderType === "dine_in" && (
        <>
          {tableNumber ? (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/20 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t("orders.tableNum").replace("{num}", tableNumber)}
              </span>
              <button
                type="button"
                onClick={onTableClear}
                className="text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            tables.length > 0 && (
              <div className="mb-2">
                <Select
                  value={tableId || ""}
                  onValueChange={(val) => {
                    const matched = tables.find((tb: any) => tb.id === val);
                    if (matched && onTableSelect) onTableSelect(matched.id, matched.number);
                  }}
                >
                  <SelectTrigger className="h-9 border bg-white/50 text-xs shadow-none dark:bg-white/5">
                    <SelectValue placeholder={t("tables.selectTablePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((tb: any) => (
                      <SelectItem key={tb.id} value={tb.id}>
                        {t("orders.tableNum").replace("{num}", String(tb.number))}{" "}
                        ({t(`tables.${tb.status === "available" ? "free" : tb.status}`)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}
        </>
      )}

      <div className="mb-2">
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("pos.enterCustomerName")}
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="h-9 rounded-lg pl-9 text-sm"
          />
        </div>
      </div>

      <div className="mb-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {cart.length === 0 && !hasUnpaid ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/25 py-8 text-muted-foreground">
            <ShoppingCart className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-sm">{t("pos.noItems")}</p>
          </div>
        ) : (
          <>
            {cart.map((item) => {
              const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
              const lineTotal = (item.unitPrice + modTotal) * item.quantity;

              return (
                <div key={item.lineId} className="space-y-1.5 rounded-lg border bg-card p-2 shadow-sm">
                  <div className="flex items-start gap-2">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="mt-0.5 h-8 w-8 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-muted">
                        <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice + modTotal)}
                        {lang === "vi" ? "" : " ea"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item.lineId)}
                      className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-10">
                      {item.modifiers.map((mod) => (
                        <span
                          key={mod.modifierId}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {mod.name}
                          {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.notes && (
                    <p className="truncate pl-10 text-[11px] italic text-muted-foreground">
                      {item.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pl-10">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 rounded-md"
                        onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                      <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 rounded-md"
                        onClick={() => onUpdateQty(item.lineId, item.quantity + 1)}
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(lineTotal)}</p>
                  </div>
                </div>
              );
            })}

            {hasUnpaid && (
              <div className="mt-2 space-y-1.5 border-t pt-2">
                <h3 className="flex items-center gap-1.5 pl-1 text-[11px] font-bold uppercase text-muted-foreground">
                  <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
                  {lang === "vi" ? "Món đã gửi bếp" : "Sent to Kitchen"}
                </h3>
                {allOrderedItems.map((item: any) => {
                  const modTotal = item.modifiers.reduce((s: number, m: any) => s + m.price, 0);
                  const lineTotal = (item.unitPrice + modTotal) * item.quantity;

                  return (
                    <div key={item.id} className="space-y-1 rounded-lg border bg-muted/40 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {item.quantity}x {item.name}
                          </p>
                          {item.modifiers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.modifiers.map((mod: any) => (
                                <span
                                  key={mod.modifierId}
                                  className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {mod.name}
                                  {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && (
                            <p className="mt-1 truncate text-[10px] italic text-muted-foreground">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {formatCurrency(lineTotal)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {cart.length > 0 && (
        <div className="mb-2">
          <Input
            placeholder={t("pos.notes")}
            value={orderNotes}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
        </div>
      )}

      {cart.length > 0 && (
        <div className="mb-2 space-y-1 border-t pt-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t("pos.subtotal")}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {t("pos.tax")} ({(taxRate / 100).toFixed(2).replace(/\.00$/, "")}%)
            </span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 text-lg font-bold">
            <span>{t("pos.total")}</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {cart.length === 0 && hasUnpaid && (
        <div className="mb-2 space-y-1 border-t pt-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {lang === "vi" ? "Tiền món đã dùng" : "Ordered Total"}
            </span>
            <span>{formatCurrency(unpaidTotal)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 text-lg font-bold">
            <span>{lang === "vi" ? "Cần thanh toán" : "Total Due"}</span>
            <span className="text-primary">{formatCurrency(unpaidTotal)}</span>
          </div>
        </div>
      )}

      {cart.length === 0 ? (
        hasUnpaid ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11 text-sm font-semibold"
              disabled={isPending}
              onClick={onPrintTemporaryBill}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Tạm tính
            </Button>
          <Button
            className="flex h-11 min-w-0 items-center justify-center gap-1.5 bg-emerald-600 px-2 text-xs font-semibold text-white hover:bg-emerald-700"
            disabled={isPending}
            onClick={onPayUnpaidOrders}
          >
            <Check className="h-4 w-4" />
            <span className="truncate">{lang === "vi" ? "Thanh toán" : "Pay"}</span>
          </Button>
          </div>
        ) : (
          <Button className="h-11 w-full text-sm font-semibold" disabled>
            <Check className="mr-2 h-4 w-4" />
            {lang === "vi" ? "Chọn món để gửi" : "Select items to send"}
          </Button>
        )
      ) : (
        <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-2">
          <Button
            variant="outline"
            className="h-11 text-sm font-semibold"
            disabled={isPending}
            onClick={() => onCreateOrder(false)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Printer className="mr-1.5 h-4 w-4" />
                {lang === "vi" ? "Gửi bếp" : "Send Kitchen"}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="h-11 text-sm font-semibold"
            disabled={isPending}
            onClick={onPrintTemporaryBill}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Printer className="mr-1.5 h-4 w-4" />
                Tạm tính
              </>
            )}
          </Button>
          <Button
            className="h-11 text-sm font-semibold"
            disabled={isPending}
            onClick={() => onCreateOrder(true)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                {lang === "vi" ? "Thanh toán" : "Pay now"} · {formatCurrency(total)}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
