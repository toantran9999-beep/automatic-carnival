"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@restai/ui/components/dialog";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Clock, ShoppingBag } from "lucide-react";
import { formatCurrency, formatElapsed } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { useTakeawayOrders, type TakeawayOrder } from "@/hooks/use-tables";
import { OrderItemLines } from "@/components/order-item-lines";
import { useTranslation } from "@/stores/lang-store";

/** "14:35" theo giờ VN. */
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
 * Đơn mang về nào đang chờ thu tiền — mở từ thẻ "Mang về đang mở" ở Bảng điều khiển,
 * cùng lối với hộp thoại "Bàn đang có khách".
 *
 * Mỗi đơn có đồng hồ đếm từ lúc tạo: đơn mang về nằm đó tới khi thu tiền, nên treo
 * lâu là dấu hiệu có chuyện (khách bỏ đi, hoặc quên bấm thanh toán).
 *
 * ⚠️ CHỈ XEM — quản lý bị `blockLiveOps` chặn ở máy chủ, bày nút thanh toán/huỷ ra
 * là bấm vào ăn lỗi 403. Thao tác làm ở tab "Mang về" bên trang Bàn ăn.
 *
 * ⚠️ Chỉ tải dữ liệu KHI MỞ (`enabled: open`) — cùng lý do với hộp thoại bàn.
 */
export function OpenTakeawayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const { data, isLoading } = useTakeawayOrders({ enabled: open });
  const now = useNow(open);

  const orders: TakeawayOrder[] = useMemo(() => (data as any) ?? [], [data]);
  const totalPending = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠️ overflow-y-auto PHẢI kèm overflow-x-hidden — khoá một chiều thì chiều kia
          tự thành `auto` và cắt cụt chữ mà im lặng. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{lang === "vi" ? "Đơn mang về đang mở" : "Open takeaway orders"}</DialogTitle>
          <DialogDescription>
            {lang === "vi"
              ? "Chỉ để xem. Thao tác bán hàng làm ở máy quầy."
              : "View only. Sales actions happen at the counter."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {lang === "vi" ? "Chưa có đơn mang về đang mở." : "No open takeaway orders."}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-primary">
                      <ShoppingBag className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        #{o.order_number}
                        {o.customer_name ? ` · ${o.customer_name}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatElapsed(o.created_at, now)}
                    </span>
                  </div>

                  {/* Giờ tạo · ai bấm — giống dòng đầu mỗi đơn ở hộp thoại bàn. */}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {vnTime(o.created_at)}
                    {" · "}
                    {o.created_by_name || "—"}
                  </p>

                  <div className="mt-2">
                    <OrderItemLines
                      items={(o.items ?? []).map((i) => ({
                        id: i.id,
                        name: i.name,
                        quantity: i.quantity,
                        // API đơn mang về trả camelCase `unitPrice`; quy ước tiền vẫn là
                        // giá GỐC chưa gồm tùy chọn, dòng phụ mới cộng/trừ vào.
                        unit_price: i.unitPrice,
                        total: i.total,
                        notes: i.notes,
                        modifiers: i.modifiers,
                      }))}
                    />
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2">
                    <span className="min-w-0 text-xs text-muted-foreground">
                      {t("dashboard.openTablesRevenue")}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(o.total || 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <span className="min-w-0 text-sm text-muted-foreground">
                {t("dashboard.openTablesRevenue")}
              </span>
              <span className="shrink-0 text-base font-bold tabular-nums text-foreground">
                {formatCurrency(totalPending)}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
