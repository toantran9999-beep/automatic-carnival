"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { DollarSign, ClipboardList, Receipt, Grid3X3, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { Overview } from "@/hooks/use-dashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  const { t } = useTranslation();
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? "+" : ""}
      {pct}% <span className="text-muted-foreground font-normal">{t("dashboard.vsYesterday")}</span>
    </span>
  );
}

interface KpiCardsProps {
  data?: Overview;
  isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  const { t } = useTranslation();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 h-7 w-24" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { today, deltas } = data;

  const cards = [
    {
      title: t("dashboard.revenueToday"),
      value: formatCurrency(today.revenue),
      icon: DollarSign,
      delta: deltas.revenuePct,
      foot: `${t("dashboard.avgOrder")}: ${formatCurrency(today.averageOrderValue)}`,
    },
    {
      title: t("dashboard.ordersToday"),
      value: String(today.orders),
      icon: ClipboardList,
      delta: deltas.ordersPct,
      foot: `${t("dashboard.activeOrders")}: ${today.activeOrders}`,
    },
    {
      title: t("dashboard.avgOrder"),
      value: formatCurrency(today.averageOrderValue),
      icon: Receipt,
      delta: null as number | null,
      foot: `${t("dashboard.cancelledToday")}: ${today.cancelledOrders}`,
    },
    {
      title: t("dashboard.occupiedTables"),
      value: `${today.occupiedTables}/${today.totalTables}`,
      icon: Grid3X3,
      delta: null as number | null,
      foot: "",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold tabular-nums sm:text-2xl">{card.value}</div>
            <div className="mt-1 min-h-[1rem]">
              {card.delta !== null ? (
                <DeltaBadge pct={card.delta} />
              ) : (
                <p className="truncate text-xs text-muted-foreground">{card.foot}</p>
              )}
            </div>
            {card.delta !== null && card.foot && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.foot}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
