"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { OverviewDay } from "@/hooks/use-dashboard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface RevenueWeekChartProps {
  days: OverviewDay[];
  isLoading: boolean;
}

export function RevenueWeekChart({ days, isLoading }: RevenueWeekChartProps) {
  const { t, lang } = useTranslation();
  const hasData = days.some((d) => d.revenue > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.revenueWeek")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revWeekFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    const d = new Date(v + "T00:00:00");
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v) => {
                    const k = Math.round(v / 100000);
                    return k > 0 ? `${k}k` : "0";
                  }}
                />
                <Tooltip
                  formatter={(value: number) => [
                    formatCurrency(value),
                    lang === "vi" ? "Doanh thu" : "Revenue",
                  ]}
                  labelFormatter={(label) => {
                    const d = new Date(label + "T00:00:00");
                    return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
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
                  strokeWidth={2}
                  fill="url(#revWeekFill)"
                  dot={{ r: 2, fill: "var(--primary)" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("dashboard.noData")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
