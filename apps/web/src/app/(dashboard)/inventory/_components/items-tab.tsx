"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Plus, AlertTriangle, Printer } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";
import { usePrintInventoryLabels } from "@/components/print-ticket";
import { useTranslation } from "@/stores/lang-store";

export function ItemsTab({
  items,
  isLoading,
  search,
  setSearch,
  onNewItem,
}: {
  items: any[];
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  onNewItem: () => void;
}) {
  const { t, lang } = useTranslation();
  const printLabels = usePrintInventoryLabels();
  const filteredItems = items.filter((item: any) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  /** In nhãn cho đúng những gì đang lọc — quán chỉ dán lại vài hũ chứ hiếm khi cả kho. */
  function printFiltered() {
    printLabels(
      filteredItems
        .filter((item: any) => item.internal_code)
        .map((item: any) => ({
          code: item.internal_code,
          name: item.name,
          unit: item.unit,
          packLabel: item.pack_label,
        })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("inventory.searchPlaceholder")}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" onClick={printFiltered} disabled={filteredItems.length === 0}>
          <Printer className="h-4 w-4 mr-2" />
          {t("inventory.printLabel")}
        </Button>
        <Button onClick={onNewItem}>
          <Plus className="h-4 w-4 mr-2" />
          {t("inventory.addIngredient")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("common.name")}
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {lang === "vi" ? "Đơn vị" : "Unit"}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                    {t("inventory.stock")}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {lang === "vi" ? "Tồn tối thiểu" : "Min Stock"}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {t("inventory.cost")}
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">
                    {t("common.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <Skeleton className="h-4 w-12 mx-auto" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-10 ml-auto" />
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Skeleton className="h-4 w-10 ml-auto" />
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Skeleton className="h-4 w-14 ml-auto" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-5 w-12 mx-auto rounded-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      {search
                        ? (lang === "vi" ? "Không tìm thấy nguyên liệu" : "No ingredients found")
                        : t("inventory.noItems")}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item: any) => {
                    const currentStock = parseFloat(
                      item.current_stock ?? "0"
                    );
                    const minStock = parseFloat(item.min_stock ?? "0");
                    const costPerUnit = item.cost_per_unit ?? 0;
                    const isLow = currentStock < minStock;
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                          isLow && "bg-destructive/5"
                        )}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {isLow && (
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-medium text-sm text-foreground">
                                {item.name}
                              </span>
                              {/* Mã để nhân viên đối chiếu với nhãn đã dán trên hũ. */}
                              {(item.internal_code || item.barcode) && (
                                <p className="font-mono text-xs text-muted-foreground truncate">
                                  {item.barcode || item.internal_code}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-center text-muted-foreground hidden sm:table-cell">
                          {item.unit}
                        </td>
                        <td
                          className={cn(
                            "p-3 text-sm font-medium text-right",
                            isLow
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {currentStock.toFixed(2)}
                        </td>
                        <td className="p-3 text-sm text-right text-muted-foreground hidden md:table-cell">
                          {minStock.toFixed(2)}
                        </td>
                        <td className="p-3 text-sm text-right text-muted-foreground hidden md:table-cell">
                          {formatCurrency(costPerUnit)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={isLow ? "destructive" : "secondary"}
                          >
                            {isLow ? (lang === "vi" ? "Sắp hết" : "Low") : "OK"}
                          </Badge>
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
