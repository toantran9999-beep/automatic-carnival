"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";

import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface ReportStatsProps {
  totalOrders: number;
  totalRevenue: number;
  avgOrder: number;
  totalTax: number;
  isLoading: boolean;
  /**
   * Phần đến từ POS cũ trong khoảng đang chọn. Truyền vào (>0) là thẻ ghi rõ ngay
   * dưới con số to.
   *
   * ⚠️ Không có dòng này thì "Tổng doanh thu 937tr" đứng cạnh bảng thanh toán cộng
   * ra 20tr, đọc như hệ thống sai — chủ quán đã báo đúng như vậy.
   */
  legacyRevenue?: number;
  legacyOrders?: number;
}

export function ReportStats({
  totalOrders,
  totalRevenue,
  avgOrder,
  totalTax,
  isLoading,
  legacyRevenue = 0,
  legacyOrders = 0,
}: ReportStatsProps) {
  const { t, lang } = useTranslation();
  const isVi = lang === "vi";
  const fromOldPos = (v: string) => (isVi ? `gồm ${v} từ POS cũ` : `incl. ${v} from the old POS`);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("reports.ordersCount")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <div className="text-2xl font-bold">{totalOrders}</div>
              {/* ⚠️ KHÔNG truncate: số nằm cuối câu, cắt cụt là nuốt mất đúng con số. */}
              {legacyOrders > 0 && (
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  {fromOldPos(
                    `${legacyOrders.toLocaleString(isVi ? "vi-VN" : "en-US")} ${isVi ? "đơn" : "orders"}`,
                  )}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("reports.revenue")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              {legacyRevenue > 0 && (
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  {fromOldPos(formatCurrency(legacyRevenue))}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("reports.avgOrder")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="text-2xl font-bold">{formatCurrency(avgOrder)}</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("reports.taxAmount")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="text-2xl font-bold">{formatCurrency(totalTax)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
