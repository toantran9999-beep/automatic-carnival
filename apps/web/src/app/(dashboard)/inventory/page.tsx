"use client";

import { useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@restai/ui/components/tabs";
import {
  AlertTriangle,
  RefreshCw,
  Package,
  ArrowUpDown,
  ChefHat,
  PackagePlus,
  PackageMinus,
} from "lucide-react";
import {
  useInventoryItems,
  useInventoryMovements,
  useInventoryAlerts,
} from "@/hooks/use-inventory";
import { useBranchSettings } from "@/hooks/use-settings";
import { PageHeader } from "@/components/page-header";
import { ItemsTab } from "./_components/items-tab";
import { ItemDialog } from "./_components/item-dialog";
import { MovementsTab } from "./_components/movements-tab";
import { CreateMovementDialog } from "./_components/movement-dialog";
import { RecipesTab } from "./_components/recipes-tab";
import { RecipeDialog } from "./_components/recipe-dialog";
import { ReceiveTab } from "./_components/receive-tab";
import { IssueTab } from "./_components/issue-tab";
import { useTranslation } from "@/stores/lang-store";

export default function InventoryPage() {
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [newItemOpen, setNewItemOpen] = useState(false);
  /** Nguyên liệu đang sửa — null là đóng hộp thoại. */
  const [editItem, setEditItem] = useState<any | null>(null);
  const [newMovementOpen, setNewMovementOpen] = useState(false);
  /** Món đang mở hộp thoại công thức — null là đóng. */
  const [recipeFor, setRecipeFor] = useState<{ id: string; name: string } | null>(null);

  const { data: branchData } = useBranchSettings();
  const inventoryEnabled = branchData?.settings?.inventory_enabled ?? false;

  const {
    data: itemsData,
    isLoading,
    error,
    refetch,
  } = useInventoryItems();
  const { data: movementsData } = useInventoryMovements();
  const { data: alertsData } = useInventoryAlerts();

  const items: any[] = itemsData ?? [];
  const movements: any[] = movementsData ?? [];
  const alerts: any[] = alertsData ?? [];

  if (!inventoryEnabled && branchData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("inventory.title")}</h1>
          <p className="text-muted-foreground">
            {lang === "vi" ? "Kiểm soát tồn kho và công thức định lượng" : "Stock control and recipes"}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2 text-center">{t("inventory.notEnabled")}</p>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              {t("inventory.enableInSettings")}
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/settings"}>
              {t("inventory.goToSettings")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("inventory.title")}</h1>
        </div>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center justify-between">
          <p className="text-sm text-destructive">
            {t("common.error")}: {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">
              {alerts.length}{" "}
              {alerts.length === 1 ? t("inventory.items").toLowerCase() : t("inventory.items").toLowerCase()}{" "}
              {lang === "vi" ? "dưới mức tối thiểu" : "below minimum stock"}
            </p>
            <p className="text-xs text-destructive/80">
              {alerts.map((a: any) => a.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <PageHeader
        title={t("inventory.title")}
        description={
          isLoading
            ? t("common.loading")
            : `${items.length} ${t("inventory.items").toLowerCase()}`
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* 5 tab không lọt màn điện thoại → cho trượt ngang. overflow-y-hidden để
            khoá chiều còn lại, kẻo nó tự thành auto và cắt cụt nhãn tab. */}
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1">
          <TabsList>
            <TabsTrigger value="stock">
              <Package className="h-4 w-4 mr-1" />
              {t("inventory.items")}
            </TabsTrigger>
            <TabsTrigger value="receive">
              <PackagePlus className="h-4 w-4 mr-1" />
              {t("inventory.receive")}
            </TabsTrigger>
            <TabsTrigger value="issue">
              <PackageMinus className="h-4 w-4 mr-1" />
              {t("inventory.issue")}
            </TabsTrigger>
            <TabsTrigger value="movements">
              <ArrowUpDown className="h-4 w-4 mr-1" />
              {t("inventory.movements")}
            </TabsTrigger>
            <TabsTrigger value="recipes">
              <ChefHat className="h-4 w-4 mr-1" />
              {t("inventory.recipes")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stock">
          <ItemsTab
            items={items}
            isLoading={isLoading}
            search={search}
            setSearch={setSearch}
            onNewItem={() => setNewItemOpen(true)}
            onEditItem={setEditItem}
          />
        </TabsContent>

        <TabsContent value="receive">
          <ReceiveTab items={items} />
        </TabsContent>

        <TabsContent value="issue">
          <IssueTab items={items} />
        </TabsContent>

        <TabsContent value="movements">
          <MovementsTab
            movements={movements}
            onNewMovement={() => setNewMovementOpen(true)}
          />
        </TabsContent>

        <TabsContent value="recipes">
          <RecipesTab items={items} onOpenRecipe={setRecipeFor} />
        </TabsContent>
      </Tabs>

      <ItemDialog open={newItemOpen} onOpenChange={setNewItemOpen} />
      <ItemDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        item={editItem}
      />
      <CreateMovementDialog
        open={newMovementOpen}
        onOpenChange={setNewMovementOpen}
        items={items}
      />
      <RecipeDialog
        open={!!recipeFor}
        onOpenChange={(open) => !open && setRecipeFor(null)}
        menuItem={recipeFor}
        items={items}
      />
    </div>
  );
}
