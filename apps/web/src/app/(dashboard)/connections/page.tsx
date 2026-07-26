"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@restai/ui/components/tabs";
import {
  Wifi,
  Check,
  X,
  Clock,
  UserCheck,
  UserX,
  RefreshCw,
  Loader2,
  Printer,
  QrCode,
  Smartphone,
  Volume2,
  VolumeX,
  Usb,
  Building2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSessions, useApproveSession, useRejectSession, useEndSession, useMyAssignedTables } from "@/hooks/use-tables";
import { useBranchSettings, useBranches } from "@/hooks/use-settings";
import { useAuthStore } from "@/stores/auth-store";
import { useStationStore } from "@/stores/station-store";
import { useTranslation } from "@/stores/lang-store";

function formatDate(dateStr: string, lang: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

/**
 * Tab "Trạm in & Kết nối": mô hình 1 chi nhánh = 1 máy trạm in.
 * - Máy trạm: bật toggle "trạm in" + hiện mã QR kết nối.
 * - Điện thoại phục vụ: quét QR (hoặc bấm chọn chi nhánh) → app chuyển sang chi
 *   nhánh đó, mọi đơn gửi đi sẽ phát về trạm in của chi nhánh qua WebSocket.
 */
function StationSection() {
  const { t, lang } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  // renewSession: kết nối lại với trạm = vào ca mới → đếm lại 8 tiếng từ đầu.
  const { selectedBranchId, setSelectedBranch, renewSession } = useAuthStore();
  const { isStation, soundEnabled, setStation, setSound } = useStationStore();
  const { data: branches } = useBranches();
  const availableBranches: any[] = branches ?? [];
  const currentBranch = availableBranches.find((b) => b.id === selectedBranchId);

  const [origin, setOrigin] = useState("");
  const [bridgeReady, setBridgeReady] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setBridgeReady(!!((window as any).TodaPrintBridge || (window as any).AndroidPrintBridge));
  }, []);

  // Điện thoại quét QR → mở /connections?connect=<branchId> → tự chuyển chi nhánh
  const handledConnect = useRef(false);
  useEffect(() => {
    if (handledConnect.current || !availableBranches.length) return;
    const target = new URLSearchParams(window.location.search).get("connect");
    if (!target) return;
    handledConnect.current = true;
    const branch = availableBranches.find((b) => b.id === target);
    if (!branch) {
      toast.error(
        lang === "vi"
          ? "Tài khoản của bạn chưa được gán vào chi nhánh này — nhờ quản lý thêm trong trang Nhân viên."
          : "Your account is not assigned to this branch."
      );
      router.replace("/connections");
      return;
    }
    // Quét mã = vào ca → đếm lại 8 tiếng, kể cả khi vẫn đúng chi nhánh cũ.
    renewSession();
    if (selectedBranchId !== branch.id) {
      setSelectedBranch(branch.id);
      qc.invalidateQueries();
    }
    toast.success(
      lang === "vi"
        ? `Đã kết nối — đơn sẽ gửi về trạm in "${branch.name}"`
        : `Connected — orders will print at "${branch.name}"`
    );
    router.replace("/tables");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableBranches]);

  const connectUrl = selectedBranchId && origin ? `${origin}/connections?connect=${selectedBranchId}` : "";

  const handlePickBranch = (branch: any) => {
    renewSession();
    if (branch.id === selectedBranchId) return;
    setSelectedBranch(branch.id);
    qc.invalidateQueries();
    toast.success(
      lang === "vi"
        ? `Đã kết nối — đơn sẽ gửi về trạm in "${branch.name}"`
        : `Connected — orders will print at "${branch.name}"`
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Máy này là trạm in */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" />
            {t("connections.stationTitle", "Máy này là trạm in")}
          </CardTitle>
          <CardDescription>
            {t(
              "connections.stationDesc",
              "Bật trên đúng 1 máy POS có máy in của mỗi chi nhánh. Máy trạm tự in phiếu đặt món mỗi khi có đơn mới trong chi nhánh."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">{t("connections.stationToggle", "Trạm in tại quầy")}</p>
              <p className="text-xs text-muted-foreground">
                {currentBranch
                  ? `${t("connections.stationOf", "Trạm của chi nhánh")}: ${currentBranch.name}`
                  : t("connections.noBranch", "Chưa chọn chi nhánh")}
              </p>
            </div>
            <Toggle checked={isStation} onChange={() => setStation(!isStation)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              <p className="text-sm font-medium">{t("connections.stationSound", "Âm báo khi có đơn mới")}</p>
            </div>
            <Toggle checked={soundEnabled} onChange={() => setSound(!soundEnabled)} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-4">
            <Usb className={cn("h-4 w-4", bridgeReady ? "text-emerald-600" : "text-muted-foreground")} />
            <p className="text-sm">
              {bridgeReady
                ? t("connections.bridgeOk", "Cầu in USB: đã kết nối (app TODA POS Quầy)")
                : t("connections.bridgeMissing", "Cầu in USB: không thấy — máy này sẽ in qua hộp thoại trình duyệt")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mã QR kết nối cho điện thoại */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            {t("connections.qrTitle", "Mã kết nối cho điện thoại order")}
          </CardTitle>
          <CardDescription>
            {t(
              "connections.qrDesc",
              "Điện thoại phục vụ (đã đăng nhập) dùng camera quét mã này → app tự chuyển sang chi nhánh và mọi đơn gửi về trạm in này."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {connectUrl ? (
            <>
              <div className="rounded-lg bg-white p-4">
                <QRCodeSVG value={connectUrl} size={200} level="M" />
              </div>
              <p className="text-sm font-semibold">{currentBranch?.name}</p>
              <p className="max-w-xs break-all text-center text-xs text-muted-foreground">{connectUrl}</p>
            </>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">{t("common.loading", "Đang tải...")}</p>
          )}
        </CardContent>
      </Card>

      {/* Điện thoại: chọn chi nhánh thủ công */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            {t("connections.pickTitle", "Kết nối máy này tới chi nhánh (không cần quét)")}
          </CardTitle>
          <CardDescription>
            {t(
              "connections.pickDesc",
              "Nhân viên làm nhiều chi nhánh: bấm chọn chi nhánh đang đứng — đơn order từ máy này sẽ gửi về trạm in của chi nhánh đó."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {availableBranches.map((branch) => {
              const active = branch.id === selectedBranchId;
              return (
                <Button
                  key={branch.id}
                  variant={active ? "default" : "outline"}
                  className="h-12 gap-2 px-4"
                  onClick={() => handlePickBranch(branch)}
                >
                  <Building2 className="h-4 w-4" />
                  {branch.name}
                  {active && <Check className="h-4 w-4" />}
                </Button>
              );
            })}
            {availableBranches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("connections.noBranches", "Tài khoản chưa được gán chi nhánh nào.")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const statusConfig: Record<string, { key: string; color: string; icon: any }> = {
  pending: { key: "connections.pending", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", icon: Clock },
  active: { key: "connections.active", color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20", icon: UserCheck },
  completed: { key: "connections.completed", color: "bg-muted text-muted-foreground border-border", icon: Check },
  rejected: { key: "connections.rejected", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20", icon: UserX },
};

/** Duyệt phiên khách quét QR bàn (luồng cũ — quán hiện không dùng nhưng giữ lại) */
function CustomerSessionsSection() {
  const { t, lang } = useTranslation();
  const [tab, setTab] = useState("pending");
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const { data: sessions, isLoading, refetch } = useSessions(tab === "all" ? undefined : tab);
  const approveSession = useApproveSession();
  const rejectSession = useRejectSession();
  const endSession = useEndSession();

  // Waiter assignment filtering
  const user = useAuthStore((s) => s.user);
  const { data: branchSettingsData } = useBranchSettings();
  const { data: myAssignedTables } = useMyAssignedTables();
  const waiterAssignmentEnabled = (branchSettingsData as any)?.settings?.waiter_table_assignment_enabled ?? false;
  const isAdminOrManager = user?.role === "super_admin" || user?.role === "org_admin" || user?.role === "branch_manager";

  const sessionList: any[] = useMemo(() => {
    const all: any[] = sessions ?? [];
    if (!waiterAssignmentEnabled || isAdminOrManager) return all;
    const assignedTableIds = new Set((myAssignedTables ?? []).map((a: any) => a.table_id));
    if (assignedTableIds.size === 0) return all;
    return all.filter((s: any) => assignedTableIds.has(s.table_id));
  }, [sessions, waiterAssignmentEnabled, isAdminOrManager, myAssignedTables]);

  const getEmptyMessage = () => {
    if (tab === "pending") return t("connections.noPendingSessions");
    if (tab === "active") return t("connections.noActiveSessions");
    return t("connections.noSessions");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("connections.refresh")}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">{t("connections.pending")}</TabsTrigger>
          <TabsTrigger value="active">{t("connections.active")}</TabsTrigger>
          <TabsTrigger value="completed">{t("connections.history")}</TabsTrigger>
          <TabsTrigger value="all">{t("connections.all")}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-lg h-20" />
              ))}
            </div>
          ) : sessionList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wifi className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{getEmptyMessage()}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessionList.map((session: any) => {
                const config = statusConfig[session.status] || statusConfig.pending;
                const Icon = config.icon;
                return (
                  <Card key={session.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn("flex items-center justify-center h-10 w-10 rounded-full border", config.color)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{session.customer_name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{t("connections.table")} {session.table_number}</span>
                              {session.customer_phone && <span>· {session.customer_phone}</span>}
                              <span>· {session.started_at ? formatDate(session.started_at, lang) : ""}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium border", config.color)}>
                            {t(config.key)}
                          </span>
                          {session.status === "pending" && (
                            <div className="flex gap-1 ml-2">
                              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={mutatingId === session.id} onClick={() => {
                                setMutatingId(session.id);
                                rejectSession.mutate(session.id, { onSettled: () => setMutatingId(null) });
                              }}>
                                {mutatingId === session.id && rejectSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" disabled={mutatingId === session.id} onClick={() => {
                                setMutatingId(session.id);
                                approveSession.mutate(session.id, { onSettled: () => setMutatingId(null) });
                              }}>
                                {mutatingId === session.id && approveSession.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                {t("connections.approve")}
                              </Button>
                            </div>
                          )}
                          {session.status === "active" && (
                            <Button size="sm" variant="outline" className="ml-2" disabled={mutatingId === session.id} onClick={() => {
                              setMutatingId(session.id);
                              endSession.mutate(session.id, { onSettled: () => setMutatingId(null) });
                            }}>
                              {mutatingId === session.id && endSession.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                              {t("connections.end")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ConnectionsPage() {
  const { t } = useTranslation();
  const [mainTab, setMainTab] = useState("station");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("connections.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("connections.subtitleStation", "Trạm in tại quầy, kết nối điện thoại order và phiên khách QR.")}
        </p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="h-11">
          <TabsTrigger value="station" className="h-9 px-4 text-sm font-semibold">
            <Printer className="mr-1.5 h-4 w-4" />
            {t("connections.tabStation", "Trạm in & Kết nối")}
          </TabsTrigger>
          <TabsTrigger value="sessions" className="h-9 px-4 text-sm font-semibold">
            <Wifi className="mr-1.5 h-4 w-4" />
            {t("connections.tabSessions", "Phiên khách QR")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="station" className="mt-4">
          <StationSection />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <CustomerSessionsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
