"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import type { PaymentMethodShare } from "@/hooks/use-reports";
import { formatCurrency } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

import { useTranslation } from "@/stores/lang-store";

const PIE_COLORS = ["#0f766e", "#2563eb", "#16a34a", "#d97706", "#e11d48", "#4b5563"];

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface PaymentMethodsChartProps {
  paymentMethods: PaymentMethodShare[];
  isLoading: boolean;
}

/**
 * Cơ cấu phương thức thanh toán.
 *
 * ⚠️ Trước đây chỉ có vòng tròn + chú thích tên, tiền chỉ hiện khi RÊ CHUỘT — mà máy
 * POS là màn cảm ứng, không có chuột để rê, nên con số coi như không tồn tại. Nay
 * tiền và tỉ lệ nằm thẳng trong danh sách bên cạnh, giống trang Tổng quan.
 *
 * ⚠️ Lát bánh chia theo `amount` chứ KHÔNG theo `value`: `value` là phần trăm đã làm
 * tròn, cộng lại chưa chắc đủ 100 nên lát vẽ ra sẽ lệch so với số hiện bên cạnh.
 */
export function PaymentMethodsChart({ paymentMethods, isLoading }: PaymentMethodsChartProps) {
  const { t, lang } = useTranslation();

  const total = paymentMethods.reduce((s, p) => s + (p.amount ?? 0), 0);
  const chartData = paymentMethods.map((p) => ({ name: p.name, value: p.amount ?? 0 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.paymentShare")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : total > 0 ? (
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
            <div className="h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={84}
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

            <ul className="w-full space-y-2.5">
              {paymentMethods.map((p, i) => {
                // Tính lại tại chỗ thay vì dùng p.value: cùng một mẫu số với lát bánh
                // thì con số và hình vẽ không bao giờ nói hai kiểu.
                const share = Math.round(((p.amount ?? 0) / total) * 100);
                return (
                  <li key={p.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      aria-hidden="true"
                    />
                    {/* min-w-0 + truncate: tên dài ("Chuyển khoản ngân hàng") co lại
                        trước, số tiền bên phải không bị đẩy ra ngoài thẻ. */}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(p.amount ?? 0)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {share}%
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center gap-2 border-t pt-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {lang === "vi" ? "Tổng" : "Total"}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{formatCurrency(total)}</span>
                <span className="w-10 shrink-0" aria-hidden="true" />
              </li>
            </ul>
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            {lang === "vi"
              ? "Không có dữ liệu phương thức thanh toán"
              : "No payment method data available"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
