"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency, shortMoney } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { SalesReportWeekday } from "@/hooks/use-reports";
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

/** Thứ tự 0..6 theo quy ước `extract(dow …)` của Postgres — 0 là Chủ nhật. */
const DOW_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Doanh thu trung bình mỗi ngày theo thứ trong tuần.
 *
 * ⚠️ Vẽ TRUNG BÌNH MỖI NGÀY, không vẽ tổng: một khoảng bất kỳ hầu như không bao giờ
 * chia hết cho 7, nên so tổng thì thứ nào lặp nhiều hơn sẽ luôn thắng — biểu đồ đọc ra
 * kết luận sai. Số ngày của từng thứ hiện trong tooltip để kiểm lại được.
 *
 * Chỉ có nghĩa khi khoảng đủ dài (vài tuần trở lên). Khoảng ngắn thì component tự ẩn.
 */
export function WeekdayChart({
  weekday,
  isLoading,
}: {
  weekday: SalesReportWeekday[];
  isLoading: boolean;
}) {
  const { t, lang } = useTranslation();
  const vi = lang === "vi";
  const names = vi ? DOW_VI : DOW_EN;

  // Dưới 2 tuần thì trung bình theo thứ chưa nói được gì — ẩn cho khỏi gây nhầm.
  const totalDays = weekday.reduce((s, w) => s + w.days, 0);
  if (!isLoading && totalDays < 14) return null;

  const data = [...weekday]
    .sort((a, b) => a.dow - b.dow)
    .map((w) => ({ ...w, label: names[w.dow] ?? String(w.dow) }));

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{t("reports.byWeekday")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("reports.byWeekdayHint")}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                  width={48}
                  tickFormatter={(v: number) => shortMoney(v, lang)}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  formatter={(value: number) => [
                    formatCurrency(value),
                    vi ? "TB mỗi ngày" : "Avg per day",
                  ]}
                  labelFormatter={(label) => {
                    const row = data.find((d) => d.label === label);
                    if (!row) return String(label);
                    return `${label} · ${row.days} ${vi ? "ngày" : "days"}`;
                  }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    color: "var(--foreground)",
                  }}
                />
                <Bar
                  dataKey="avgRevenue"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
