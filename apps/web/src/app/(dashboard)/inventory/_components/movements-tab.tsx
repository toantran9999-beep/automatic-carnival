"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { formatDate, formatQty } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

export function MovementsTab({ movements }: { movements: any[] }) {
  const { t, lang } = useTranslation();

  const movementTypeLabels: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    purchase: { label: t("inventory.receive"), variant: "default" },
    consumption: { label: lang === "vi" ? "Tiêu hao" : "Consumption", variant: "secondary" },
    issue: { label: t("inventory.issueReasonUse"), variant: "secondary" },
    waste: { label: lang === "vi" ? "Hao hụt" : "Waste", variant: "destructive" },
    adjustment: { label: lang === "vi" ? "Điều chỉnh" : "Adjustment", variant: "outline" },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("inventory.movementType")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {lang === "vi" ? "Nguyên liệu" : "Ingredient"}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                    {t("common.quantity")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {lang === "vi" ? "Tham chiếu / Lý do" : "Reference"}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {t("common.date")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      {lang === "vi" ? "Chưa ghi nhận giao dịch kho nào" : "No stock movements recorded"}
                    </td>
                  </tr>
                ) : (
                  movements.map((mov: any) => {
                    const typeConfig =
                      movementTypeLabels[mov.type] ||
                      movementTypeLabels.adjustment;
                    return (
                      <tr
                        key={mov.id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-3">
                          <Badge variant={typeConfig.variant}>
                            {typeConfig.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm font-medium text-foreground">
                          {mov.item_name || "-"}
                        </td>
                        <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">
                          {formatQty(mov.quantity)}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                          {mov.reference || "-"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground text-right hidden md:table-cell">
                          {mov.created_at
                            ? formatDate(mov.created_at)
                            : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
