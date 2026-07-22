"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useTranslation } from "@/stores/lang-store";
import { useInventoryAlerts } from "@/hooks/use-inventory";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface AlertItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number | string;
  min_stock: number | string;
}

export function LowStockCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useInventoryAlerts();
  const items: AlertItem[] = Array.isArray(data) ? data : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" aria-hidden="true" />
          {t("dashboard.lowStock")}
        </CardTitle>
        <Link
          href="/inventory"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          {t("dashboard.viewInventory")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-500">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.stockOk")}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 6).map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex-1 truncate">{it.name}</span>
                <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 tabular-nums dark:text-amber-500">
                  {Number(it.current_stock)}/{Number(it.min_stock)} {it.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
