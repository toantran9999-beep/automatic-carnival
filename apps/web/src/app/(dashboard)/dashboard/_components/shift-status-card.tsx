"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import { useCurrentShift } from "@/hooks/use-shifts";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export function ShiftStatusCard() {
  const { t, lang } = useTranslation();
  const { data: shift, isLoading } = useCurrentShift();

  const openedTime = shift?.opened_at
    ? new Date(shift.opened_at).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("dashboard.shiftStatus")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : shift ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
                {t("dashboard.shiftOpen")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.openedAt")} {openedTime}
            </p>
            {shift.summary && (
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(shift.summary.totalSales)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">{t("dashboard.shiftClosed")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
