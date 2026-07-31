"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import type { PaymentMethodShare } from "@/hooks/use-reports";
import { formatCurrency, formatDayMonthYear } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

import { useTranslation } from "@/stores/lang-store";

const PIE_COLORS = ["#0f766e", "#2563eb", "#16a34a", "#d97706", "#e11d48", "#4b5563"];

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface PaymentMethodsChartProps {
  paymentMethods: PaymentMethodShare[];
  isLoading: boolean;
  /**
   * Ngày bắt đầu có dữ liệu hình thức thanh toán. Truyền vào khi khoảng ngày đang chọn
   * lấn sang phần nhập từ POS cũ (bản xuất cũ không ghi hình thức trả), để hiện ghi chú
   * — nếu không người xem sẽ tưởng tỉ lệ tiền mặt/chuyển khoản là của cả kỳ.
   */
  noteFrom?: string | null;
  /**
   * Doanh thu của phần đơn thật — mốc để bảng này TỰ đối chiếu.
   *
   * ⚠️ KHÔNG truyền `totalRevenue` vào đây: tổng đó có cả 359 ngày nhập từ POS cũ,
   * so với bảng thanh toán (chỉ có đơn thật) là so nhầm khoảng, đúng cái đã làm chủ
   * quán tưởng hệ thống sai.
   */
  liveRevenue?: number;
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
export function PaymentMethodsChart({
  paymentMethods,
  isLoading,
  noteFrom,
  liveRevenue,
}: PaymentMethodsChartProps) {
  const { t, lang } = useTranslation();

  const total = paymentMethods.reduce((s, p) => s + (p.amount ?? 0), 0);
  const chartData = paymentMethods.map((p) => ({ name: p.name, value: p.amount ?? 0 }));

  // ⚠️ So BẰNG TUYỆT ĐỐI, không đặt sai số cho phép: tiền lưu theo xu (số nguyên) nên
  // lệch 1 đồng cũng là có chuyện thật — đơn đã đóng mà chưa ghi lần thu tiền nào.
  const hasCheck = typeof liveRevenue === "number";
  const gap = hasCheck ? liveRevenue - total : 0;
  const matches = hasCheck && gap === 0;
  const fromLabel = noteFrom ? formatDayMonthYear(noteFrom, lang) : "";

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{t("reports.paymentShare")}</CardTitle>
        {noteFrom && (
          // Nói đủ LÝ DO, không chỉ "chỉ tính từ ngày X": người xem cần biết phần
          // trước đó không phải bị bỏ sót mà là số cũ vốn không ghi hình thức trả.
          <p className="text-xs leading-snug text-muted-foreground">
            {t("reports.onlyFrom")} {fromLabel}
            {lang === "vi"
              ? " — trước đó là số nhập từ POS cũ, bản xuất không ghi hình thức trả."
              : " — earlier data was imported from the old POS, which did not record payment methods."}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : total > 0 ? (
          <>
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

              {/* Dòng tự đối chiếu: hai con số này PHẢI bằng nhau. Có nó thì bảng tự
                  chứng minh mình đúng, khỏi phải tin vào dòng chú thích. */}
              {hasCheck && (
                <li className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                    {lang === "vi" ? "Doanh thu từ" : "Revenue since"} {fromLabel || "—"}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(liveRevenue!)}
                  </span>
                  <span
                    className={`w-10 shrink-0 text-right text-xs ${
                      matches ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
                    }`}
                  >
                    {matches ? "✓" : "≠"}
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Lệch là chuyện thật, không phải chuyện trình bày — nói rõ nguyên nhân
              để chủ quán biết đi tìm ở đâu, chứ đừng chỉ ném ra con số chênh. */}
          {hasCheck && !matches && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 font-medium text-destructive">
                  {lang === "vi" ? "Chênh" : "Gap"}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-destructive">
                  {formatCurrency(Math.abs(gap))}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {gap > 0
                  ? lang === "vi"
                    ? "Có đơn đã đóng mà chưa ghi lần thu tiền nào — kiểm lại ở trang Đơn hàng."
                    : "Some closed orders have no payment recorded — check the Orders page."
                  : lang === "vi"
                    ? "Tiền đã thu nhiều hơn doanh thu đơn — có thể do thu thừa hoặc ghi trùng lần thu."
                    : "Payments exceed order revenue — possible overpayment or duplicate entry."}
              </p>
            </div>
          )}
          </>
        ) : (
          // Khoảng ngày nằm trọn trong dữ liệu POS cũ thì rỗng là ĐÚNG, không phải
          // hỏng — phải nói ra, kẻo lại tưởng mất dữ liệu.
          <div className="flex h-[180px] items-center justify-center px-4 text-center text-sm leading-snug text-muted-foreground">
            {lang === "vi"
              ? noteFrom
                ? `Khoảng ngày đang chọn nằm trước ${fromLabel} — số nhập từ POS cũ không ghi hình thức thanh toán.`
                : "Không có dữ liệu phương thức thanh toán"
              : noteFrom
                ? `The selected range ends before ${fromLabel} — data imported from the old POS has no payment method.`
                : "No payment method data available"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
