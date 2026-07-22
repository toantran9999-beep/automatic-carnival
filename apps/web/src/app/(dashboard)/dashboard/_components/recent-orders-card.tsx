"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
  preparing: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
  ready: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
  served: "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface RecentOrdersCardProps {
  orders: any[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function RecentOrdersCard({ orders, isLoading, error, onRetry }: RecentOrdersCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.recentOrders")}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="py-4 text-center">
            <p className="mb-2 text-sm text-destructive">{t("dashboard.errorOrders")}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("dashboard.retry")}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-2.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("dashboard.noRecentOrders")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {orders.map((order: any) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg border p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {order.orderNumber || order.order_number || order.id}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.tableName || order.table_name || order.table || ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      statusColors[order.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {t(`dashboard.status_${order.status}`, order.status)}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(order.total ?? 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
