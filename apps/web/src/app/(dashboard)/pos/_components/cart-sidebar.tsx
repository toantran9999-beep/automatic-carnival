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

// ---------------------------------------------------------------------------
// CartSidebar
// ---------------------------------------------------------------------------

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
  const tax = Math.round(total - (total / (1 + (taxRate / 10000))));
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const unpaidOrders = activeSession?.orders?.filter((o: any) => o.status !== "completed" && o.status !== "cancelled") || [];
  const hasUnpaid = unpaidOrders.length > 0;
  const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);

  // Extract all unpaid ordered items from the session's orders
  const allOrderedItems = unpaidOrders.flatMap((order: any) => 
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
    <div className={className ?? "w-80 lg:w-96 flex flex-col border-l pl-4"}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          {t("pos.cartTitle")}
          {totalQty > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalQty}
            </Badge>
          )}
        </h2>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onClearCart}
          >
            {t("pos.clear")}
          </Button>
        )}
      </div>

      {/* Order type */}
      <div className="flex gap-2 mb-3">
        <Button
          variant={orderType === "dine_in" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onOrderTypeChange("dine_in")}
        >
          {t("pos.dineIn")}
        </Button>
        <Button
          variant={orderType === "takeout" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onOrderTypeChange("takeout")}
        >
          {t("pos.takeaway")}
        </Button>
      </div>

      {/* Table Selection / Indicator */}
      {orderType === "dine_in" && (
        <>
          {tableNumber ? (
            <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
              <span className="font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {t("tables.tableName")}: {t("orders.tableNum").replace("{num}", tableNumber)}
              </span>
              <button
                type="button"
                onClick={onTableClear}
                className="text-[10px] text-muted-foreground hover:text-foreground font-medium underline"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            tables.length > 0 && (
              <div className="mb-3">
                <Select
                  value={tableId || ""}
                  onValueChange={(val) => {
                    const matched = tables.find((t: any) => t.id === val);
                    if (matched && onTableSelect) {
                      onTableSelect(matched.id, matched.number);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-white/50 dark:bg-white/5 border shadow-none">
                    <SelectValue placeholder={t("tables.selectTablePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((tb: any) => (
                      <SelectItem key={tb.id} value={tb.id}>
                        {t("orders.tableNum").replace("{num}", String(tb.number))} ({t(`tables.${tb.status === "available" ? "free" : tb.status}`)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}
        </>
      )}

      {/* Customer */}
      <div className="mb-3">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("pos.enterCustomerName")}
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto space-y-1.5 mb-3 pr-1">
        {cart.length === 0 && !hasUnpaid ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">{t("pos.noItems")}</p>
          </div>
        ) : (
          <>
            {cart.map((item) => {
              const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
              const lineTotal = (item.unitPrice + modTotal) * item.quantity;
              return (
                <div
                  key={item.lineId}
                  className="rounded-lg border p-2.5 space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    {/* Mini thumbnail */}
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-9 w-9 rounded object-cover flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice + modTotal)}{lang === "vi" ? "" : " ea"}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemove(item.lineId)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Modifiers */}
                  {item.modifiers.length > 0 && (
                    <div className="pl-11 flex flex-wrap gap-1">
                      {item.modifiers.map((mod) => (
                        <span
                          key={mod.modifierId}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {mod.name}
                          {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="pl-11 text-[11px] text-muted-foreground italic truncate">
                      {item.notes}
                    </p>
                  )}

                  {/* Qty + line total */}
                  <div className="flex items-center justify-between pl-11">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                      <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
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

            {/* Ordered items (read-only) */}
            {hasUnpaid && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 pl-1">
                  <UtensilsCrossed className="h-3.5 w-3.5 text-primary" />
                  {lang === "vi" ? "Món đã gửi bếp" : "Sent to Kitchen"}
                </h3>
                <div className="space-y-1.5">
                  {allOrderedItems.map((item: any) => {
                    const modTotal = item.modifiers.reduce((s: number, m: any) => s + m.price, 0);
                    const lineTotal = (item.unitPrice + modTotal) * item.quantity;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border bg-muted/40 p-2.5 space-y-1"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {item.quantity}x {item.name}
                            </p>
                            {item.modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.modifiers.map((mod: any) => (
                                  <span
                                    key={mod.modifierId}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-background text-muted-foreground border"
                                  >
                                    {mod.name}
                                    {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-[10px] text-muted-foreground italic mt-1 truncate">
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      {cart.length > 0 && (
        <div className="mb-3">
          <Input
            placeholder={t("pos.notes")}
            value={orderNotes}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            className="text-sm"
          />
        </div>
      )}

      {/* Totals */}
      {cart.length > 0 && (
        <div className="border-t pt-3 space-y-1 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("pos.subtotal")}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("pos.tax")} ({((taxRate) / 100).toFixed(2).replace(/\.00$/, "")}%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-1.5 border-t">
            <span>{t("pos.total")}</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {/* Totals for Unpaid Table when cart is empty */}
      {cart.length === 0 && hasUnpaid && (
        <div className="border-t pt-3 space-y-1 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{lang === "vi" ? "Tiền món đã dùng" : "Ordered Total"}</span>
            <span>{formatCurrency(unpaidTotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-1.5 border-t">
            <span>{lang === "vi" ? "Cần thanh toán" : "Total Due"}</span>
            <span className="text-primary">{formatCurrency(unpaidTotal)}</span>
          </div>
        </div>
      )}

      {/* Create order / Pay order action buttons */}
      {cart.length === 0 ? (
        hasUnpaid ? (
          <Button
            className="w-full h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
            disabled={isPending}
            onClick={onPayUnpaidOrders}
          >
            <Check className="h-5 w-5" />
            {lang === "vi" ? "Thanh toán bàn" : "Pay Table"} · {formatCurrency(unpaidTotal)}
          </Button>
        ) : (
          <Button
            className="w-full h-12 text-base font-semibold"
            disabled
          >
            <Check className="h-5 w-5 mr-2" />
            {t("pos.checkout")}
          </Button>
        )
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-12 text-sm font-semibold"
            disabled={isPending}
            onClick={() => onCreateOrder(false)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Printer className="h-4 w-4 mr-1.5" />
                {lang === "vi" ? "Gửi Bếp" : "Send Kitchen"}
              </>
            )}
          </Button>
          <Button
            className="flex-[1.5] h-12 text-sm font-semibold"
            disabled={isPending}
            onClick={() => onCreateOrder(true)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                {lang === "vi" ? "Thanh toán" : "Pay now"} · {formatCurrency(total)}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
