"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
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
}

export function SalesChart({ days, isLoading }: SalesChartProps) {
  const { t, lang } = useTranslation();
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
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickFormatter={(v) => {
                    const d = new Date(v + "T00:00:00");
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickFormatter={(v) => {
                    const val = v / 100;
                    return lang === "vi" ? `${val} đ` : `$${val}`;
                  }}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), lang === "vi" ? "Doanh thu" : "Sales"]}
                  labelFormatter={(label) => {
                    const d = new Date(label + "T00:00:00");
                    return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" });
                  }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={2}
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
