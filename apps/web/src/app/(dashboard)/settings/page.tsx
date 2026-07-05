"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { RefreshCw, Building2, MapPin, Store, Printer, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { OrgTab } from "./_components/org-tab";
import { BranchTab } from "./_components/branch-tab";
import { SedesTab } from "./_components/sedes-tab";
import { DeviceTab } from "./_components/device-tab";
import { ReceiptTab } from "./_components/receipt-tab";
import { useTranslation } from "@/stores/lang-store";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"org" | "branch" | "receipt" | "sedes" | "device">("org");
  const { t } = useTranslation();

  const { error: orgError, refetch: refetchOrg } = useOrgSettings();
  const { error: branchError, refetch: refetchBranch } = useBranchSettings();

  const error = orgError || branchError;
  if (error) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader title={t("settings.title")} />
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">{t("common.error")}: {(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => { refetchOrg(); refetchBranch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("dashboard.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "org" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("org")}
        >
          <Building2 className="h-4 w-4 mr-2" />
          {t("settings.tabOrg")}
        </Button>
        <Button
          variant={activeTab === "branch" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("branch")}
        >
          <MapPin className="h-4 w-4 mr-2" />
          {t("settings.tabBranch")}
        </Button>
        <Button
          variant={activeTab === "receipt" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("receipt")}
        >
          <ReceiptText className="h-4 w-4 mr-2" />
          {t("settings.tabReceipt", "Hóa đơn")}
        </Button>
        <Button
          variant={activeTab === "sedes" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("sedes")}
        >
          <Store className="h-4 w-4 mr-2" />
          {t("settings.tabBranches")}
        </Button>
        <Button
          variant={activeTab === "device" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("device")}
        >
          <Printer className="h-4 w-4 mr-2" />
          {t("settings.tabDevice")}
        </Button>
      </div>

      {activeTab === "org" && <OrgTab />}
      {activeTab === "branch" && <BranchTab />}
      {activeTab === "receipt" && <ReceiptTab />}
      {activeTab === "sedes" && <SedesTab />}
      {activeTab === "device" && <DeviceTab />}
    </div>
  );
}
