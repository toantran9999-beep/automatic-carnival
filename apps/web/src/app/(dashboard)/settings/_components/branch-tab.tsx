"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { cn } from "@/lib/utils";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

export function BranchTab() {
  const { data: branchData, isLoading: branchLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();
  const { t } = useTranslation();

  const [branchForm, setBranchForm] = useState({
    name: "",
    address: "",
    phone: "",
    taxRate: "10.00",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    inventoryEnabled: false,
    waiterTableAssignmentEnabled: false,
    printMode: "combined" as "combined" | "per_item",
  });

  useEffect(() => {
    if (branchData) {
      setBranchForm({
        name: branchData.name || "",
        address: branchData.address || "",
        phone: branchData.phone || "",
        taxRate: ((branchData.tax_rate ?? 1000) / 100).toFixed(2),
        timezone: branchData.timezone || "Asia/Ho_Chi_Minh",
        currency: branchData.currency || "VND",
        inventoryEnabled: branchData.settings?.inventory_enabled ?? false,
        waiterTableAssignmentEnabled: branchData.settings?.waiter_table_assignment_enabled ?? false,
        printMode: branchData.settings?.print_mode === "per_item" ? "per_item" : "combined",
      });
    }
  }, [branchData]);

  const handleBranchSave = async () => {
    try {
      const taxRateNum = Math.round(parseFloat(branchForm.taxRate) * 100);
      await updateBranch.mutateAsync({
        name: branchForm.name,
        address: branchForm.address,
        phone: branchForm.phone,
        taxRate: taxRateNum,
        timezone: branchForm.timezone,
        currency: branchForm.currency,
        inventoryEnabled: branchForm.inventoryEnabled,
        waiterTableAssignmentEnabled: branchForm.waiterTableAssignmentEnabled,
        printMode: branchForm.printMode,
      });
      toast.success(t("settings.branchSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.branchTitle")}</CardTitle>
        <CardDescription>
          {t("settings.branchDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {branchLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchName">{t("settings.branchNameLabel")}</Label>
                <Input
                  id="branchName"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchPhone">{t("settings.phoneLabel")}</Label>
                <Input
                  id="branchPhone"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchAddress">{t("settings.addressLabel")}</Label>
              <Input
                id="branchAddress"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.timezoneLabel")}</Label>
                <Select value={branchForm.timezone} onValueChange={(v) => setBranchForm({ ...branchForm, timezone: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.selectTimezone")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.currencyLabel")}</Label>
                <Select value={branchForm.currency} onValueChange={(v) => setBranchForm({ ...branchForm, currency: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.selectCurrency")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND (đ)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchTaxRate">{t("settings.taxLabel")}</Label>
              <Input
                id="branchTaxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={branchForm.taxRate}
                onChange={(e) => setBranchForm({ ...branchForm, taxRate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.taxHelp")}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">{t("settings.inventoryControl")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.inventoryHelp")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.inventoryEnabled}
                onClick={() => setBranchForm({ ...branchForm, inventoryEnabled: !branchForm.inventoryEnabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.inventoryEnabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.inventoryEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">{t("settings.waiterAssignment")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.waiterAssignmentHelp")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.waiterTableAssignmentEnabled}
                onClick={() => setBranchForm({ ...branchForm, waiterTableAssignmentEnabled: !branchForm.waiterTableAssignmentEnabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.waiterTableAssignmentEnabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.waiterTableAssignmentEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <Label>{t("settings.printModeLabel")}</Label>
              <Select
                value={branchForm.printMode}
                onValueChange={(v) => setBranchForm({ ...branchForm, printMode: v as "combined" | "per_item" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">{t("settings.printModeCombined")}</SelectItem>
                  <SelectItem value="per_item">{t("settings.printModePerItem")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.printModeHelp")}
              </p>
            </div>
            <Button onClick={handleBranchSave} disabled={updateBranch.isPending}>
              {updateBranch.isPending ? t("settings.saving") : t("settings.saveChanges")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
