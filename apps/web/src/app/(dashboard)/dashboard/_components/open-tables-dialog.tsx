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
import { useTables } from "@/hooks/use-tables";
import { useTranslation } from "@/stores/lang-store";

/** "54p" khi dưới 1 giờ, "1h26p" khi trên — cùng cách hiện với thẻ bàn bên Bàn ăn. */
function formatElapsed(startedAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  if (mins < 60) return `${mins}p`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}p`;
}

/**
 * Bàn nào đang uống gì — mở từ thẻ "Bàn đang sử dụng" ở Bảng điều khiển, để chủ
 * quán khỏi phải nhảy qua trang Bàn ăn chỉ để liếc.
 *
 * ⚠️ CHỈ XEM. Không nút thanh toán / huỷ / gộp tách: Bảng điều khiển là màn của
 * quản lý, mà quản lý bị `blockLiveOps` chặn ở máy chủ — bày nút ra là bấm vào
 * ăn lỗi 403.
 *
 * ⚠️ Chỉ tải dữ liệu KHI MỞ (`enabled: open`). `useTables` là truy vấn nặng (bàn
 * + phiên + đơn + món) và thuộc nhóm dữ liệu sống nên lần nào cũng gọi lại; để
 * nó chạy sẵn là mỗi lần vào Bảng điều khiển lại kéo một lượt chẳng ai xem.
 */
export function OpenTablesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const { data, isLoading } = useTables(undefined, { enabled: open });

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
    return list
      .filter((tb) => tb.activeSession)
      .sort((a, b) => a.number - b.number);
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
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {lang === "vi" ? "Bàn đang có khách" : "Tables in use"}
          </DialogTitle>
          <DialogDescription>
            {lang === "vi"
              ? "Chỉ để xem. Thao tác bán hàng làm ở máy quầy."
              : "View only. Sales actions happen at the counter."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : openTables.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {lang === "vi" ? "Chưa có bàn nào có khách." : "No tables in use."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {openTables.map((tb) => (
                <li key={tb.id} className="flex items-start gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-bold tabular-nums text-primary">
                    {tb.number}
                  </span>
                  {/* min-w-0: phần chữ co lại trước, số tiền bên phải không bao
                      giờ bị đẩy ra ngoài khung. */}
                  <div className="min-w-0 flex-1">
                    {/* KHÔNG truncate: danh sách món chính là thứ cần đọc ở đây. */}
                    <p className="text-sm leading-snug text-foreground">
                      {tb.activeSession?.itemSummary ||
                        (lang === "vi" ? "Chưa gọi món" : "No items yet")}
                    </p>
                    {tb.activeSession?.startedAt && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatElapsed(tb.activeSession.startedAt, now)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(Number(tb.activeSession?.total || 0))}
                  </span>
                </li>
              ))}
            </ul>
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
