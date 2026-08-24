"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { OverviewPaymentMethod } from "@/hooks/use-dashboard";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PaymentReconcile } from "@/components/payment-reconcile";

const PIE_COLORS = ["#0f766e", "#2563eb", "#16a34a", "#d97706", "#e11d48", "#4b5563"];

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface PaymentDonutProps {
  paymentMethods: OverviewPaymentMethod[];
  isLoading: boolean;
  /**
   * Doanh thu hôm nay — mốc để vòng tròn này TỰ đối chiếu.
   *
   * ⚠️ Hai con số cùng lấy từ CÙNG một tập đơn đã hoàn tất, nên chúng phải bằng
   * nhau. Ngày 24/08/2026 chúng đá nhau 133.000đ (6 đơn chuyển khoản bị ghi thu
   * hai lần) và nằm cạnh nhau suốt nhiều ngày mà không có gì báo động.
   */
  todayRevenue?: number;
}

export function PaymentDonut({ paymentMethods, isLoading, todayRevenue }: PaymentDonutProps) {
  const { t } = useTranslation();
  const methodLabel = (m: string) => t(`dashboard.method_${m}`, m);
  const total = paymentMethods.reduce((s, p) => s + p.amount, 0);
  const chartData = paymentMethods.map((p) => ({ name: methodLabel(p.method), value: p.amount }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.paymentMethods")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : total > 0 ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), ""]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full space-y-2">
              {paymentMethods.map((p, i) => {
                const share = total > 0 ? Math.round((p.amount / total) * 100) : 0;
                return (
                  <li key={p.method} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-muted-foreground">
                      {methodLabel(p.method)}
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {share}%
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center gap-2 border-t pt-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {t("dashboard.total", "Tổng")}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{formatCurrency(total)}</span>
                <span className="w-9 shrink-0" aria-hidden="true" />
              </li>

              {/* Dùng chung với trang Báo cáo — xem `components/payment-reconcile`. */}
              <PaymentReconcile
                paidTotal={total}
                revenue={todayRevenue}
                label={t("dashboard.todayRevenue", "Doanh thu hôm nay")}
              />
            </ul>
          </div>
        ) : (
          <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
            {t("dashboard.noData")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
