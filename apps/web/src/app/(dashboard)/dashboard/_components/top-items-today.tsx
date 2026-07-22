"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { OverviewTopItem } from "@/hooks/use-dashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface TopItemsTodayProps {
  topItems: OverviewTopItem[];
  isLoading: boolean;
}

export function TopItemsToday({ topItems, isLoading }: TopItemsTodayProps) {
  const { t } = useTranslation();
  const max = topItems.reduce((m, it) => Math.max(m, it.revenue), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.topItemsToday")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : topItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("dashboard.noItemsToday")}
          </p>
        ) : (
          <ol className="space-y-3">
            {topItems.map((item, i) => (
              <li key={item.name || i} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-4 shrink-0 text-center font-semibold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    ×{item.quantity}
                  </span>
                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                    {formatCurrency(item.revenue)}
                  </span>
                </div>
                <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${max > 0 ? Math.round((item.revenue / max) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
