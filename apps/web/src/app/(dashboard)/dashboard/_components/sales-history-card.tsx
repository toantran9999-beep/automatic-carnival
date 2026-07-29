"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { SalesHistory } from "@/hooks/use-dashboard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

/** 0 = Chủ nhật … 6 = Thứ bảy — theo quy ước `extract(dow …)` của Postgres. */
const DOW_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const tooltipSurface = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
};

/** Trục tiền để nguyên cents, chia 100 rồi rút gọn: 405000000 → "4tr". */
function shortMoney(cents: number, lang: string) {
  const dong = cents / 100;
  if (dong >= 1_000_000) return `${Math.round(dong / 1_000_000)}${lang === "vi" ? "tr" : "M"}`;
  if (dong >= 1_000) return `${Math.round(dong / 1_000)}k`;
  return String(Math.round(dong));
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Lịch sử bán hàng của POS CŨ (trước 26/07/2026).
 *
 * Tách hẳn khỏi các thẻ khác trên trang và ghi rõ nguồn: đây là dữ liệu nhập một
 * lần từ bản xuất Excel, KHÔNG phải đơn đang bán. Trộn lẫn hai thứ vào một biểu đồ
 * là cách nhanh nhất để ai đó đọc nhầm rồi ra quyết định sai.
 *
 * Chưa nhập lịch sử thì component tự ẩn (`available === false`), không hiện khung rỗng.
 */
export function SalesHistoryCard({
  data,
  isLoading,
}: {
  data?: SalesHistory;
  isLoading: boolean;
}) {
  const { t, lang } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.available) return null;

  const { totals, range, monthly, weekday, topItems } = data;
  const dowNames = lang === "vi" ? DOW_VI : DOW_EN;
  const revenueLabel = lang === "vi" ? "Doanh thu" : "Revenue";

  const monthlyData = monthly.map((m) => ({
    ...m,
    // 'YYYY-MM' → 'MM/YY' cho đỡ chật trục
    label: `${m.month.slice(5)}/${m.month.slice(2, 4)}`,
  }));

  // So theo TRUNG BÌNH MỖI NGÀY, không so tổng: mỗi thứ có số ngày khác nhau trong
  // kỳ (359 ngày không chia hết cho 7), so tổng là thứ nào lặp nhiều hơn thắng.
  const weekdayData = weekday.map((w) => ({
    ...w,
    label: dowNames[w.dow] ?? String(w.dow),
    avgRevenue: w.days > 0 ? Math.round(w.revenue / w.days) : 0,
  }));

  const avgPerDay = totals.days > 0 ? Math.round(totals.revenue / totals.days) : 0;

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("dashboard.historyTitle")}</CardTitle>
          {range.first && range.last && (
            <Badge variant="secondary" className="text-xs font-normal tabular-nums">
              {range.first} → {range.last}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("dashboard.historySource")}</p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("dashboard.historyTotalRevenue")} value={formatCurrency(totals.revenue)} />
          <Stat
            label={t("dashboard.historyTotalOrders")}
            value={totals.orders.toLocaleString(lang === "vi" ? "vi-VN" : "en-US")}
          />
          <Stat
            label={t("dashboard.historyDays")}
            value={totals.days.toLocaleString(lang === "vi" ? "vi-VN" : "en-US")}
          />
          <Stat label={t("dashboard.historyAvgPerDay")} value={formatCurrency(avgPerDay)} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("dashboard.historyMonthly")}</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="label"
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => shortMoney(v, lang)}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  formatter={(value: number) => [formatCurrency(value), revenueLabel]}
                  contentStyle={tooltipSurface}
                />
                <Bar
                  dataKey="revenue"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">{t("dashboard.historyWeekday")}</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis
                    dataKey="label"
                    className="text-xs"
                    tick={{ fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => shortMoney(v, lang)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    formatter={(value: number) => [formatCurrency(value), revenueLabel]}
                    contentStyle={tooltipSurface}
                  />
                  <Bar
                    dataKey="avgRevenue"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t("dashboard.historyTopItems")}</p>
            <ol className="space-y-1.5">
              {topItems.slice(0, 8).map((item, i) => (
                <li key={item.name} className="flex items-center gap-3 text-sm">
                  <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {Math.round(item.quantity).toLocaleString(lang === "vi" ? "vi-VN" : "en-US")}
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatCurrency(item.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
