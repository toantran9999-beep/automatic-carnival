"use client";

import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { toThumbUrl } from "@/lib/image-thumb";
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
  Banknote,
  Receipt,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { modifierLabel } from "@restai/config";
import { useTranslation } from "@/stores/lang-store";
import { useBranchSettings } from "@/hooks/use-settings";
import type { PosCartItem } from "../page";

export function CartSidebar({
  cart,
  orderType,
  customerName,
  orderNotes,
  pendingAction,
  tableNumber,
  onCustomerNameChange,
  onOrderNotesChange,
  onUpdateQty,
  onRemove,
  onClearCart,
  onCreateOrder,
  onPrintTemporaryBill,
  activeSession,
  onPayUnpaidOrders,
  needsTable = false,
  className,
}: {
  cart: PosCartItem[];
  orderType: "dine_in" | "takeout";
  customerName: string;
  orderNotes: string;
  /** Nút nào đang chạy — chỉ nút đó quay vòng, các nút khác chỉ mờ đi. */
  pendingAction: "send" | "pay" | "prebill" | null;
  tableNumber: string | null;
  onCustomerNameChange: (name: string) => void;
  onOrderNotesChange: (notes: string) => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClearCart: () => void;
  onCreateOrder: (payImmediately: boolean) => void;
  onPrintTemporaryBill: () => void;
  activeSession?: any;
  onPayUnpaidOrders?: () => void;
  needsTable?: boolean;
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
            className="h-11 px-3 text-sm text-destructive"
            onClick={onClearCart}
          >
            {t("pos.clear")}
          </Button>
        )}
      </div>

      {/* CHỈ ĐỂ ĐỌC — cố ý không cho đổi ở đây.
          Trước đây chỗ này là nút gạt "Ăn tại bàn / Mang về" cộng ô sổ xuống liệt kê
          TOÀN BỘ bàn, nên vào `/pos?takeout=1` rồi gạt một cái là có màn bán hàng
          dine-in đầy đủ mà chưa hề đi qua sơ đồ bàn — đúng đường lách chủ quán báo.
          Nay loại đơn do LỐI VÀO quyết định; muốn đổi thì quay ra màn Bàn ăn. */}
      <div
        className={`mb-2 flex items-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
          orderType === "dine_in"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/20 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-300"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            orderType === "dine_in" ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
        {orderType === "dine_in"
          ? tableNumber
            ? t("orders.tableNum").replace("{num}", tableNumber)
            : t("pos.dineIn")
          : t("pos.takeaway")}
      </div>

      <div className="mb-2">
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("pos.enterCustomerName")}
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="h-11 rounded-lg pl-9 text-base"
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
                        src={toThumbUrl(item.imageUrl)}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = item.imageUrl!;
                        }}
                        className="mt-0.5 h-8 w-8 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-muted">
                        <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold leading-snug">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice + modTotal)}
                        {lang === "vi" ? "" : " ea"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item.lineId)}
                      className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  {item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-10">
                      {item.modifiers.map((mod, mi) => (
                        <span
                          // Khoá kèm giá trị + vị trí: hai ly cùng tùy chọn khác số
                          // (9g / 15g) dùng chung `modifierId` nên khoá trần bị trùng.
                          key={`${mod.modifierId ?? "x"}-${mod.value ?? ""}-${mi}`}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {modifierLabel(mod.name, mod.value, mod.unit)}
                          {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.notes && (
                    <p className="truncate pl-10 text-xs italic text-muted-foreground">
                      {item.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pl-10">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-lg"
                        onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-10 text-center text-lg font-bold tabular-nums">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-lg"
                        onClick={() => onUpdateQty(item.lineId, item.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
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
                  {lang === "vi" ? "Món đã gửi" : "Sent"}
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
                              {item.modifiers.map((mod: any, mi: number) => (
                                <span
                                  key={`${mod.modifierId ?? "x"}-${mi}`}
                                  className="rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                  {/* Món đã gửi: tên do máy chủ ghép sẵn ("Đường 13g"). */}
                                  {mod.name}
                                  {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && (
                            <p className="mt-1 truncate text-xs italic text-muted-foreground">
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
            // Ô của CẢ ĐƠN — in một lần ngay dưới BÀN / MANG VỀ và loa đọc một lần.
            // Ghi "giao đâu" ở đây chứ đừng gõ vào ghi chú từng món (in lặp mỗi món).
            placeholder={t("pos.orderNotesPlaceholder")}
            value={orderNotes}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            className="h-11 rounded-lg text-base"
          />
        </div>
      )}

      {/* Con số tổng phải đọc được từ xa một bước chân — thu ngân đọc to cho khách. */}
      {(cart.length > 0 || hasUnpaid) && (
        <div className="mb-2 border-t pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {cart.length > 0
                ? t("pos.total")
                : lang === "vi" ? "Cần thanh toán" : "Total due"}
            </span>
            <span className="text-2xl font-extrabold tabular-nums text-primary">
              {formatCurrency(cart.length > 0 ? total : unpaidTotal)}
            </span>
          </div>
          {cart.length > 0 && (
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {t("pos.tax")} {(taxRate / 100).toFixed(2).replace(/\.00$/, "")}%: {formatCurrency(tax)}
            </p>
          )}
        </div>
      )}

      {/*
        ⚠️ THỨ BẬC NÚT THEO TẦN SUẤT THẬT (đo 14 ngày, 2.316 đơn, 25/10/2026):
        tại bàn 94% / mang về 61% là "gửi phiếu trước, thu tiền sau" → ~82% lượt
        bấm là GỬI & IN PHIẾU. Nên nút đó to nhất, đặc, chiếm cả hàng. "Thu tiền
        ngay" đứng hàng hai; "Tạm tính" (vài lần một ngày) nhỏ nhất.
        Thứ tự KHÔNG đổi theo loại đơn — tay thu ngân quen vị trí, đảo là bấm nhầm.
      */}
      {cart.length === 0 ? (
        hasUnpaid ? (
          <div className="space-y-2">
            <BigButton
              tone="pay"
              icon={<Check className="h-6 w-6" />}
              label={lang === "vi" ? "Thanh toán" : "Pay"}
              sub={formatCurrency(unpaidTotal)}
              loading={false}
              disabled={!!pendingAction}
              onClick={() => onPayUnpaidOrders?.()}
            />
            <SmallButton
              icon={<Receipt className="h-4.5 w-4.5" />}
              label="Tạm tính"
              loading={pendingAction === "prebill"}
              disabled={!!pendingAction}
              onClick={onPrintTemporaryBill}
            />
          </div>
        ) : (
          <div className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed text-base font-semibold text-muted-foreground">
            {lang === "vi" ? "Chọn món để gửi" : "Select items to send"}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {needsTable && (
            <p className="text-center text-xs font-medium text-amber-600">
              {lang === "vi"
                ? "Chọn bàn để gửi đơn (ăn tại bàn)"
                : "Select a table to send the order (dine-in)"}
            </p>
          )}
          <BigButton
            tone="send"
            icon={<Printer className="h-6 w-6" />}
            label={lang === "vi" ? "Gửi & in phiếu" : "Send & print"}
            sub={lang === "vi" ? `${totalQty} món` : `${totalQty} items`}
            loading={pendingAction === "send"}
            loadingLabel={lang === "vi" ? "Đang gửi…" : "Sending…"}
            disabled={!!pendingAction || needsTable}
            onClick={() => onCreateOrder(false)}
          />
          <div className="grid grid-cols-3 gap-2">
            <SmallButton
              className="col-span-2 border-2 border-emerald-600 font-bold text-emerald-700 dark:text-emerald-400"
              icon={<Banknote className="h-5 w-5" />}
              label={lang === "vi" ? "Thu tiền ngay" : "Pay now"}
              loading={pendingAction === "pay"}
              disabled={!!pendingAction || needsTable}
              onClick={() => onCreateOrder(true)}
            />
            <SmallButton
              icon={<Receipt className="h-4.5 w-4.5" />}
              label="Tạm tính"
              loading={pendingAction === "prebill"}
              disabled={!!pendingAction || needsTable}
              onClick={onPrintTemporaryBill}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Nút chính chân giỏ: cao 64px, chữ to, cả hàng. Bấm là đổi nền + lún nhẹ ngay
 * (không chờ máy chủ) để thu ngân biết máy đã nhận cú chạm.
 */
function BigButton({
  tone,
  icon,
  label,
  sub,
  loading,
  loadingLabel,
  disabled,
  onClick,
}: {
  tone: "send" | "pay";
  icon: React.ReactNode;
  label: string;
  sub?: string;
  loading: boolean;
  loadingLabel?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const color =
    tone === "send"
      ? "bg-primary text-primary-foreground active:bg-primary/80"
      : "bg-emerald-600 text-white active:bg-emerald-700";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-16 w-full items-center justify-center gap-3 rounded-xl px-4 shadow-md transition-transform duration-75 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${color}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg font-bold">{loadingLabel ?? label}</span>
        </>
      ) : (
        <>
          {icon}
          <span className="text-lg font-extrabold uppercase tracking-wide">{label}</span>
          {sub && (
            <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-sm font-bold tabular-nums">
              {sub}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/** Nút hàng hai: cao 48px, vẫn đủ vùng chạm, nhẹ hơn hẳn nút chính. */
function SmallButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border bg-card px-2 text-sm font-semibold transition-transform duration-75 active:scale-[0.97] active:bg-muted disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
