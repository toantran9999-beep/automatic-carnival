"use client";

import { useMemo, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { Label } from "@restai/ui/components/label";
import { Check, RefreshCw, Building2, Store } from "lucide-react";
import {
  useSalesReport,
  useTopItems,
  type SalesReportDay,
  type PaymentMethodShare,
  type TopItemReport,
} from "@/hooks/use-reports";
import { useBranches } from "@/hooks/use-settings";
import { useAuthStore } from "@/stores/auth-store";
import { formatCurrency } from "@/lib/utils";
import { ReportStats } from "./_components/report-stats";
import { SalesChart } from "./_components/sales-chart";
import { PaymentMethodsChart } from "./_components/payment-methods-chart";
import { TopItemsList } from "./_components/top-items-list";
import { ShiftHistoryList } from "./_components/shift-history-list";
import { useTranslation } from "@/stores/lang-store";
import { PageHeader } from "@/components/page-header";

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getTodayRange() {
  const today = new Date().toISOString().split("T")[0];
  return { start: today, end: today };
}

function getLastDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: start.toISOString().split("T")[0],
    end: now.toISOString().split("T")[0],
  };
}

export default function ReportsPage() {
  const { t, lang } = useTranslation();
  const defaults = useMemo(() => getDefaultDates(), []);
  const [startDate, setStartDate] = useState<string>(defaults.start);
  const [endDate, setEndDate] = useState<string>(defaults.end);
  const [draftStartDate, setDraftStartDate] = useState<string>(defaults.start);
  const [draftEndDate, setDraftEndDate] = useState<string>(defaults.end);
  const [allBranches, setAllBranches] = useState(false);

  const user = useAuthStore((s) => s.user);
  const { data: branchList } = useBranches();
  const canViewAll =
    (user?.role === "org_admin" || user?.role === "super_admin") &&
    (branchList?.length ?? 0) > 1;
  const effectiveAll = canViewAll && allBranches;

  const {
    data: salesData,
    isLoading: salesLoading,
    isFetching: salesFetching,
    error: salesError,
    refetch: refetchSales,
  } = useSalesReport(startDate, endDate, effectiveAll);

  const {
    data: topItemsData,
    isLoading: topItemsLoading,
    isFetching: topItemsFetching,
    error: topItemsError,
    refetch: refetchTopItems,
  } = useTopItems(startDate, endDate, 10, effectiveAll);

  const METHOD_LABELS: Record<string, string> = {
    cash: t("payments.cash"),
    card: t("payments.card"),
    yape: t("payments.yape"),
    plin: t("payments.plin"),
    transfer: t("payments.transfer"),
    other: t("payments.other"),
  };

  const days: SalesReportDay[] = salesData?.days ?? [];
  const paymentMethods: PaymentMethodShare[] = (salesData?.paymentMethods ?? []).map((pm) => ({
    ...pm,
    name: METHOD_LABELS[pm.name] || pm.name,
  }));
  const topItems: TopItemReport[] = topItemsData ?? [];

  const totalRevenue = salesData?.totalRevenue || 0;
  const totalOrders = salesData?.totalOrders || 0;
  const totalTax = salesData?.totalTax || 0;
  const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const error = salesError || topItemsError;
  const isLoading = salesLoading || topItemsLoading;
  const isRefreshing = salesFetching || topItemsFetching;
  const hasPendingDateChanges =
    draftStartDate !== startDate || draftEndDate !== endDate;
  const invalidDateRange =
    !!draftStartDate && !!draftEndDate && draftStartDate > draftEndDate;

  const applyRange = (range: { start: string; end: string }) => {
    setDraftStartDate(range.start);
    setDraftEndDate(range.end);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const applyFilters = () => {
    if (invalidDateRange || !hasPendingDateChanges) return;
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("reports.title")} />
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">{t("reports.errorLoad")}: {(error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={() => {
              refetchSales();
              refetchTopItems();
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.analysis")}
        actions={
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="space-y-2 w-full sm:w-auto sm:min-w-[220px]">
            <Label className="text-xs text-muted-foreground block pl-0.5">{t("reports.from")}</Label>
            <DatePicker
              value={draftStartDate}
              onChange={(d) => setDraftStartDate(d ?? "")}
              className="w-full sm:w-[220px]"
            />
          </div>
          <div className="space-y-2 w-full sm:w-auto sm:min-w-[220px]">
            <Label className="text-xs text-muted-foreground block pl-0.5">{t("reports.to")}</Label>
            <DatePicker
              value={draftEndDate}
              onChange={(d) => setDraftEndDate(d ?? "")}
              className="w-full sm:w-[220px]"
            />
          </div>
          <Button
            size="sm"
            className="h-9 active:translate-y-px active:scale-[0.98]"
            disabled={!hasPendingDateChanges || invalidDateRange || isRefreshing}
            onClick={applyFilters}
          >
            <Check className="h-4 w-4" />
            {t("reports.apply")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 active:translate-y-px active:scale-[0.98]"
            disabled={isRefreshing}
            onClick={() => {
              refetchSales();
              refetchTopItems();
            }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {lang === "vi" ? "Cập nhật" : "Refresh"}
          </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 active:translate-y-px active:scale-[0.98]"
          onClick={() => applyRange(getTodayRange())}
        >
          {t("reports.today")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 active:translate-y-px active:scale-[0.98]"
          onClick={() => applyRange(getLastDaysRange(7))}
        >
          {t("reports.last7days")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 active:translate-y-px active:scale-[0.98]"
          onClick={() => applyRange(getLastDaysRange(30))}
        >
          {t("reports.last30days")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 active:translate-y-px active:scale-[0.98]"
          onClick={() => applyRange(getCurrentMonthRange())}
        >
          {t("reports.thisMonth")}
        </Button>
        {canViewAll && (
          <Button
            type="button"
            variant={allBranches ? "default" : "outline"}
            size="sm"
            className="h-8 ml-auto active:translate-y-px active:scale-[0.98]"
            onClick={() => setAllBranches((v) => !v)}
          >
            <Store className="h-4 w-4" />
            {t("reports.allBranches")}
          </Button>
        )}
        {isRefreshing && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <span className="h-1.5 w-6 rounded-full bg-muted-foreground/40 animate-pulse" />
            {t("reports.loading")}
          </span>
        )}
      </div>
      {invalidDateRange && (
        <p className="text-sm text-destructive">
          {t("reports.invalidRange")}
        </p>
      )}

      <ReportStats
        totalOrders={totalOrders}
        totalRevenue={totalRevenue}
        avgOrder={avgOrder}
        totalTax={totalTax}
        isLoading={isLoading}
      />

      {effectiveAll && (salesData?.branches?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            {t("reports.revenueByBranch")}
          </h3>
          <div className="space-y-2">
            {salesData!.branches!.map((b) => {
              const pct = totalRevenue > 0 ? Math.round((b.revenue / totalRevenue) * 100) : 0;
              return (
                <div key={b.branchId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(b.revenue)} · {b.orders} {t("reports.ordersShort")}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SalesChart days={days} isLoading={salesLoading} />
        <PaymentMethodsChart paymentMethods={paymentMethods} isLoading={salesLoading} />
      </div>

      <TopItemsList topItems={topItems} isLoading={topItemsLoading} />

      <ShiftHistoryList />
    </div>
  );
}
