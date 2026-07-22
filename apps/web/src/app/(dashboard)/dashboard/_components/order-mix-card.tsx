"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { useTranslation } from "@/stores/lang-store";
import type { OverviewOrderType } from "@/hooks/use-dashboard";

const TYPE_COLORS: Record<string, string> = {
  dine_in: "bg-primary",
  takeout: "bg-amber-500",
  delivery: "bg-blue-500",
};

interface OrderMixCardProps {
  orderTypes: OverviewOrderType[];
  cancelledOrders: number;
}

export function OrderMixCard({ orderTypes, cancelledOrders }: OrderMixCardProps) {
  const { t } = useTranslation();
  const typeLabel = (type: string) =>
    type === "dine_in"
      ? t("dashboard.dineIn")
      : type === "takeout"
        ? t("dashboard.takeout")
        : type === "delivery"
          ? t("dashboard.delivery")
          : type;

  const total = orderTypes.reduce((s, o) => s + o.orders, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("dashboard.orderMix")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("dashboard.noData")}</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {orderTypes.map((o) => (
                <div
                  key={o.type}
                  className={TYPE_COLORS[o.type] || "bg-muted-foreground"}
                  style={{ width: `${Math.round((o.orders / total) * 100)}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <ul className="space-y-1.5">
              {orderTypes.map((o) => (
                <li key={o.type} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_COLORS[o.type] || "bg-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-muted-foreground">{typeLabel(o.type)}</span>
                  <span className="font-medium tabular-nums">{o.orders}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {t("dashboard.cancelledToday")}:{" "}
          <span className="font-medium text-foreground tabular-nums">{cancelledOrders}</span>
        </p>
      </CardContent>
    </Card>
  );
}
