"use client";

import { Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import { useShiftHistory } from "@/hooks/use-shifts";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

/** Lịch sử các ca đã đóng — thống kê hàng ngày (doanh thu cả ngày + đối soát tiền mặt). */
export function ShiftHistoryList() {
  const { lang } = useTranslation();
  const vi = lang === "vi";
  const { data: shifts, isLoading } = useShiftHistory(30);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(vi ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Clock className="h-4 w-4 text-primary" />
        {vi ? "Lịch sử ca làm việc" : "Shift history"}
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !shifts || shifts.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {vi ? "Chưa có ca nào được đóng." : "No closed shifts yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => {
            const diff = s.cash_difference ?? 0;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {fmtDate(s.opened_at)} → {s.closed_at ? fmtDate(s.closed_at) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.closed_by_name || "—"}
                    {s.day_summary && (
                      <>
                        {" · "}
                        {vi ? "Cả ngày" : "Full day"}: {formatCurrency(s.day_summary.totalRevenue)} ·{" "}
                        {s.day_summary.totalOrders} {vi ? "đơn" : "orders"}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {vi ? "Doanh thu ca" : "Shift sales"}
                    </p>
                    <p className="font-semibold">{formatCurrency(s.total_sales || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {vi ? "Chênh lệch quỹ" : "Cash diff"}
                    </p>
                    <p
                      className={`font-semibold ${
                        diff === 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : diff > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {diff === 0 ? (vi ? "Khớp" : "OK") : formatCurrency(Math.abs(diff))}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
