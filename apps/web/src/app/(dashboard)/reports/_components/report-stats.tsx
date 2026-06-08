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
}

export function ReportStats({
  totalOrders,
  totalRevenue,
  avgOrder,
  totalTax,
  isLoading,
}: ReportStatsProps) {
  const { t } = useTranslation();
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
            <div className="text-2xl font-bold">{totalOrders}</div>
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
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
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
