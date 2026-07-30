"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@restai/ui/components/dialog";
import { Badge } from "@restai/ui/components/badge";
import { Skeleton } from "@restai/ui/components/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useOrder } from "@/hooks/use-orders";
import { OrderItemLines } from "@/components/order-item-lines";
import { useTranslation } from "@/stores/lang-store";

/** "14:35" theo giờ VN — dùng cho món gọi thêm, khỏi lặp lại cả ngày tháng. */
function vnTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/**
 * Chi tiết một đơn: ai bấm, lúc nào, món gì kèm tùy chọn, thu tiền mấy lần.
 *
 * Món nào do NGƯỜI KHÁC hoặc vào GIỜ KHÁC so với lúc mở đơn thì được ghi kèm
 * "14:35 · Tuấn" — đó chính là món khách gọi thêm giữa buổi.
 *
 * ⚠️ CHỈ XEM. Nút In / Thu tiền vẫn ở cột Hành động của bảng: quản lý bị
 * `blockLiveOps` chặn ở máy chủ, bày nút thao tác ra là bấm vào ăn lỗi 403.
 *
 * ⚠️ Đơn tạo trước 30/07/2026 không có người bấm (hệ thống chưa từng lưu) → hiện
 * "—" kèm ghi chú, chứ không đoán bừa từ ca làm.
 */
export function OrderDetailDialog({
  orderId,
  onOpenChange,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const open = !!orderId;
  const { data, isLoading } = useOrder(orderId ?? "", { enabled: open });

  const isVi = lang === "vi";
  const L = {
    title: isVi ? "Chi tiết đơn" : "Order detail",
    table: isVi ? "Bàn" : "Table",
    takeaway: isVi ? "Mang về" : "Takeaway",
    dineIn: isVi ? "Tại bàn" : "Dine-in",
    openedAt: isVi ? "Mở đơn" : "Opened",
    staff: isVi ? "Nhân viên" : "Staff",
    items: isVi ? "Món đã gọi" : "Items",
    noStaffNote: isVi
      ? "Đơn cũ không lưu nhân viên order — hệ thống chỉ bắt đầu ghi từ 30/07/2026."
      : "Older orders have no staff recorded — tracking started 30 Jul 2026.",
    payments: isVi ? "Đã thu" : "Payments",
    noPayment: isVi ? "Chưa thu tiền" : "Not paid yet",
    notes: isVi ? "Ghi chú" : "Notes",
  };

  const order = data;
  const orderStaff = order?.created_by_name ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠️ overflow-y-auto PHẢI kèm overflow-x-hidden — khoá một chiều thì chiều kia
          tự thành `auto` và cắt cụt chữ mà im lặng. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {L.title}
            {order ? ` #${order.order_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            {order
              ? [
                  order.type === "takeout" ? L.takeaway : L.dineIn,
                  order.table_number != null ? `${L.table} ${order.table_number}` : null,
                  order.customer_name || null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !order ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t("orders.status_" + order.status, order.status)}</Badge>
            </div>

            {/* Ai mở đơn, lúc nào — thứ anh Toàn cần nhất ở màn này. */}
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{L.openedAt}</span>
                <span className="shrink-0 text-right tabular-nums">
                  {formatDate(order.created_at)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{L.staff}</span>
                <span className="min-w-0 break-words text-right font-medium">
                  {orderStaff || "—"}
                </span>
              </div>
              {!orderStaff && (
                <p className="pt-1 text-xs leading-snug text-muted-foreground">{L.noStaffNote}</p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {L.items}
              </p>
              <OrderItemLines
                items={order.items.map((i) => {
                  // Chỉ ghi giờ+người khi KHÁC lúc mở đơn — món gốc thì ghi lại là
                  // nhiễu, món gọi thêm mới là thông tin.
                  const sameStaff = (i.created_by_name ?? null) === orderStaff;
                  const sameMinute =
                    !!i.created_at && vnTime(i.created_at) === vnTime(order.created_at);
                  const meta =
                    sameStaff && sameMinute
                      ? undefined
                      : [vnTime(i.created_at), i.created_by_name || "—"]
                          .filter(Boolean)
                          .join(" · ");
                  return {
                    id: i.id,
                    name: i.name,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    total: i.total,
                    notes: i.notes ?? undefined,
                    modifiers: i.modifiers,
                    meta,
                  };
                })}
              />
            </div>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("common.subtotal", "Tạm tính")}</span>
                <span className="shrink-0 tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("common.discount", "Giảm giá")}</span>
                  <span className="shrink-0 tabular-nums">-{formatCurrency(order.discount)}</span>
                </div>
              )}
              {order.tax > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("common.tax", "Thuế VAT")}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(order.tax)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="font-medium">{t("common.total")}</span>
                <span className="shrink-0 text-base font-bold tabular-nums">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {L.payments}
              </p>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{L.noPayment}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {t("payments." + p.method, p.method)} · {vnTime(p.created_at)}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {order.notes && (
              <div className="border-t pt-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {L.notes}
                </p>
                <p className="leading-snug text-foreground">{order.notes}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
