"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { OverviewHour } from "@/hooks/use-dashboard";
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

// Khung giờ mở cửa quán café — luôn hiển thị đủ cột, giờ không có đơn = 0.
const START_HOUR = 6;
const END_HOUR = 22;

interface HourlyChartProps {
  hourly: OverviewHour[];
  isLoading: boolean;
}

export function HourlyChart({ hourly, isLoading }: HourlyChartProps) {
  const { t } = useTranslation();

  const byHour = new Map(hourly.map((h) => [h.hour, h]));
  const data = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const row = byHour.get(h);
    data.push({
      hour: h,
      label: `${h}h`,
      revenue: row ? row.revenue : 0,
      orders: row ? row.orders : 0,
    });
  }
  const hasData = hourly.some((h) => h.revenue > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.revenueByHour")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="label"
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
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
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  formatter={(value: number, _n, item: any) => [
                    `${formatCurrency(value)} · ${item?.payload?.orders ?? 0} ${t("dashboard.status_completed").toLowerCase()}`,
                    "",
                  ]}
                  labelFormatter={(label) => label}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    color: "var(--foreground)",
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
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
