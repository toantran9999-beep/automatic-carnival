"use client";

import { useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Plus } from "lucide-react";
import { useRecipe } from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";

export function RecipesTab({
  items,
  onNewRecipe,
}: {
  items: any[];
  onNewRecipe: () => void;
}) {
  const { t, lang } = useTranslation();
  const [recipeMenuItemId, setRecipeMenuItemId] = useState("");
  const { data: recipeData } = useRecipe(recipeMenuItemId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          {lang === "vi"
            ? "Cấu hình công thức định lượng để tự động trừ kho khi đơn hàng hoàn thành."
            : "Configure recipes to automatically deduct inventory when an order is completed."}
        </p>
        <Button onClick={onNewRecipe} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          {lang === "vi" ? "Tạo công thức" : "New Recipe"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>{lang === "vi" ? "Xem công thức định lượng của món ăn" : "View recipe for a menu item"}</Label>
            <Input
              placeholder={lang === "vi" ? "ID của món ăn (UUID)" : "Menu item ID (UUID)"}
              value={recipeMenuItemId}
              onChange={(e) => setRecipeMenuItemId(e.target.value)}
            />
          </div>
          {recipeMenuItemId && recipeData && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">
                {lang === "vi" ? "Nguyên liệu:" : "Ingredients:"}
              </p>
              {(recipeData as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {lang === "vi" ? "Chưa cấu hình công thức định lượng" : "No recipe configured"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-2 text-sm font-medium text-muted-foreground">
                          {lang === "vi" ? "Nguyên liệu" : "Ingredient"}
                        </th>
                        <th className="text-right p-2 text-sm font-medium text-muted-foreground">
                          {t("common.quantity")}
                        </th>
                        <th className="text-center p-2 text-sm font-medium text-muted-foreground">
                          {lang === "vi" ? "Đơn vị" : "Unit"}
                        </th>
                        <th className="text-right p-2 text-sm font-medium text-muted-foreground">
                          {t("inventory.stock")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recipeData as any[]).map(
                        (ing: any, i: number) => (
                          <tr
                            key={i}
                            className="border-b border-border last:border-0"
                          >
                            <td className="p-2 text-sm text-foreground">
                              {ing.item_name}
                            </td>
                            <td className="p-2 text-sm text-right text-foreground">
                              {parseFloat(ing.quantity_used).toFixed(3)}
                            </td>
                            <td className="p-2 text-sm text-center text-muted-foreground">
                              {ing.item_unit}
                            </td>
                            <td className="p-2 text-sm text-right text-muted-foreground">
                              {parseFloat(ing.current_stock).toFixed(2)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
