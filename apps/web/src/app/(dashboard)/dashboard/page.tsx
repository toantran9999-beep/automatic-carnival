"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@restai/ui/components/button";
import { RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useOverview, useRecentOrders } from "@/hooks/use-dashboard";
import { useTranslation } from "@/stores/lang-store";
import { PageHeader } from "@/components/page-header";
import { isManagerRole, landingPathForRole } from "@/lib/roles";
import { KpiCards } from "./_components/kpi-cards";
import { RevenueWeekChart } from "./_components/revenue-week-chart";
import { HourlyChart } from "./_components/hourly-chart";
import { PaymentDonut } from "./_components/payment-donut";
import { TopItemsToday } from "./_components/top-items-today";
import { LowStockCard } from "./_components/low-stock-card";
import { ShiftStatusCard } from "./_components/shift-status-card";
import { RecentOrdersCard } from "./_components/recent-orders-card";
import { OrderMixCard } from "./_components/order-mix-card";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { t } = useTranslation();

  // Chỉ quản lý trở lên mới xem Tổng quan — thu ngân/phục vụ/bếp bị đưa về màn của họ.
  useEffect(() => {
    if (user && !isManagerRole(user.role)) {
      router.replace(landingPathForRole(user.role));
    }
  }, [user, router]);

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    isFetching,
  } = useOverview();
  const {
    data: recentOrders,
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useRecentOrders();

  if (user && !isManagerRole(user.role)) return null;

  const orders: any[] = Array.isArray(recentOrders) ? recentOrders : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchOverview()}
            disabled={isFetching}
            aria-label={t("dashboard.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="ml-2 hidden sm:inline">{t("dashboard.refresh")}</span>
          </Button>
        }
      />

      {overviewError ? (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {t("dashboard.errorStats")}: {(overviewError as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("dashboard.retry")}
          </Button>
        </div>
      ) : (
        <>
          {/* Hàng 1: KPI */}
          <KpiCards data={overview} isLoading={overviewLoading} />

          {/* Hàng 2: doanh thu 7 ngày + phương thức thanh toán */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RevenueWeekChart days={overview?.days ?? []} isLoading={overviewLoading} />
            </div>
            <PaymentDonut
              paymentMethods={overview?.paymentMethods ?? []}
              isLoading={overviewLoading}
            />
          </div>

          {/* Hàng 3: doanh thu theo giờ + món bán chạy */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <HourlyChart hourly={overview?.hourly ?? []} isLoading={overviewLoading} />
            </div>
            <TopItemsToday topItems={overview?.topItems ?? []} isLoading={overviewLoading} />
          </div>

          {/* Hàng 4: đơn gần đây + cột phải (ca / kho / cơ cấu đơn) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentOrdersCard
                orders={orders}
                isLoading={ordersLoading}
                error={ordersError}
                onRetry={() => refetchOrders()}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <ShiftStatusCard />
              <OrderMixCard
                orderTypes={overview?.orderTypes ?? []}
                cancelledOrders={overview?.today.cancelledOrders ?? 0}
              />
              <div className="sm:col-span-2 lg:col-span-1">
                <LowStockCard />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
