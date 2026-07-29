"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency, shortMoney } from "@/lib/utils";
import type { SalesReportDay } from "@/hooks/use-reports";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface SalesChartProps {
  days: SalesReportDay[];
  isLoading: boolean;
  /**
   * 'month' khi khoảng chọn dài hơn 92 ngày — lúc đó `date` là 'YYYY-MM' chứ không
   * phải 'YYYY-MM-DD', nên nhãn và tooltip phải đổi theo.
   */
  granularity?: "day" | "month";
}

/** '2026-07' hoặc '2026-07-26' → nhãn ngắn cho trục X. */
function axisLabel(raw: string, byMonth: boolean): string {
  const [y, m, d] = raw.split("-");
  return byMonth ? `${m}/${y.slice(2)}` : `${Number(d)}/${Number(m)}`;
}

export function SalesChart({ days, isLoading, granularity = "day" }: SalesChartProps) {
  const { t, lang } = useTranslation();
  const byMonth = granularity === "month";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.salesOverTime")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : days.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(v: string) => axisLabel(v, byMonth)}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  // Trước đây in `${v / 100} đ` → ra "3936000 đ", khoảng dài càng vỡ trục.
                  tickFormatter={(v: number) => shortMoney(v, lang)}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), lang === "vi" ? "Doanh thu" : "Sales"]}
                  labelFormatter={(label: string) => {
                    if (byMonth) {
                      const [y, m] = label.split("-");
                      return lang === "vi" ? `Tháng ${Number(m)}/${y}` : `${m}/${y}`;
                    }
                    // "T00:00:00Z" + getUTC*: đọc bằng giờ máy thì múi âm lùi mất một ngày.
                    const d = new Date(label + "T00:00:00Z");
                    return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    });
                  }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    color: "var(--foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {lang === "vi" ? "Không có dữ liệu doanh thu" : "No sales data available"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
