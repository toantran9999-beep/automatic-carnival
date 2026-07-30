"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@restai/ui/components/dialog";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useOpenTablesDetail, type OpenTableOrder } from "@/hooks/use-tables";
import { OrderItemLines } from "@/components/order-item-lines";
import { useTranslation } from "@/stores/lang-store";

/** "54p" khi dưới 1 giờ, "1h26p" khi trên — cùng cách hiện với thẻ bàn bên Bàn ăn. */
function formatElapsed(startedAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  if (mins < 60) return `${mins}p`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}p`;
}

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
 * Bàn nào đang uống gì — mở từ thẻ "Bàn đang sử dụng" ở Bảng điều khiển, để chủ
 * quán khỏi phải nhảy qua trang Bàn ăn chỉ để liếc.
 *
 * Tách theo TỪNG ĐƠN kèm giờ và tên người bấm: một bàn gọi thêm vài lần là chuyện
 * thường, gộp hết vào một danh sách thì không biết lần nào ai gọi lúc nào. Trước đây
 * còn tệ hơn: máy chủ chỉ gửi một chuỗi đã gộp THEO TÊN MÓN, nên hai ly cùng tên
 * khác tùy chọn bị nhập thành một dòng.
 *
 * ⚠️ CHỈ XEM. Không nút thanh toán / huỷ / gộp tách: Bảng điều khiển là màn của
 * quản lý, mà quản lý bị `blockLiveOps` chặn ở máy chủ — bày nút ra là bấm vào
 * ăn lỗi 403.
 *
 * ⚠️ Chỉ tải dữ liệu KHI MỞ (`enabled: open`), và dùng khoá đệm riêng — xem
 * `useOpenTablesDetail`.
 */
export function OpenTablesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const { data, isLoading } = useOpenTablesDetail({ enabled: open });

  // Đồng hồ chỉ chạy khi hộp thoại đang mở.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const openTables = useMemo(() => {
    const list: any[] = (data as any)?.tables ?? [];
    return list.filter((tb) => tb.activeSession).sort((a, b) => a.number - b.number);
  }, [data]);

  const totalPending = openTables.reduce(
    (sum, tb) => sum + Number(tb.activeSession?.total || 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠️ overflow-y-auto PHẢI đi kèm overflow-x-hidden: khoá một chiều thì
          chiều kia tự thành `auto`, khung trượt ngang được và CẮT CỤT chữ mà
          im lặng. Đã trả giá ở màn thanh toán POS. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{lang === "vi" ? "Bàn đang có khách" : "Tables in use"}</DialogTitle>
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
        ) : openTables.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {lang === "vi" ? "Chưa có bàn nào có khách." : "No tables in use."}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {openTables.map((tb) => {
                const orders: OpenTableOrder[] = tb.activeSession?.orders ?? [];
                return (
                  <div key={tb.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold tabular-nums text-primary">
                        {tb.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {tb.activeSession?.customerName || ""}
                      </span>
                      {tb.activeSession?.startedAt && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatElapsed(tb.activeSession.startedAt, now)}
                        </span>
                      )}
                    </div>

                    {orders.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {lang === "vi" ? "Chưa gọi món" : "No items yet"}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2.5">
                        {orders.map((o) => (
                          <div key={o.id}>
                            {/* Số phiếu · giờ · ai bấm — cho biết bàn này gọi thêm
                                mấy lần và ai nhận từng lần. */}
                            <p className="text-xs font-medium text-muted-foreground">
                              {lang === "vi" ? "Đơn" : "Order"} #{o.orderNumber}
                              {" · "}
                              {vnTime(o.createdAt)}
                              {" · "}
                              {o.createdByName || "—"}
                            </p>
                            <div className="mt-1 pl-1">
                              <OrderItemLines
                                items={o.items.map((i) => ({
                                  id: i.id,
                                  name: i.name,
                                  quantity: i.quantity,
                                  unit_price: i.unit_price,
                                  total: i.total,
                                  notes: i.notes,
                                  modifiers: i.modifiers,
                                }))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2">
                      <span className="min-w-0 text-xs text-muted-foreground">
                        {t("dashboard.openTablesRevenue")}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatCurrency(Number(tb.activeSession?.total || 0))}
                      </span>
                    </div>
                  </div>
                );
              })}
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
