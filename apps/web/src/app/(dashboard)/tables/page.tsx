"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@restai/ui/components/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import {
  Plus,
  RefreshCw,
  Check,
  X,
  Bell,
  LayoutGrid,
  Map as MapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/stores/lang-store";
import type { WsMessage } from "@restai/types";
import { toast } from "sonner";
import {
  useTables,
  useUpdateTableStatus,
  useDeleteTable,
  useSpaces,
  useDeleteSpace,
  usePendingSessions,
  useApproveSession,
  useRejectSession,
  useVoidTableSession,
  useTakeawayOrders,
  useVoidTakeaway,
  type TakeawayOrder,
} from "@/hooks/use-tables";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PosPaymentDialog } from "../pos/_components/pos-payment-dialog";
import type { PosCartItem } from "../pos/page";
import { useBranchSettings } from "@/hooks/use-settings";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloorPlannerView } from "./_components/floor-planner-view";
import { GridView } from "./_components/grid-view";
import { QrDialog } from "./_components/qr-dialog";
import { CreateTableDialog } from "./_components/create-table-dialog";
import { CreateSpaceDialog, EditSpaceDialog, SpaceInfoCard } from "./_components/space-management";
import { HistoryDialog } from "./_components/history-dialog";
import { AssignmentDialog } from "./_components/assignment-dialog";
import { TableOperationsDialog } from "./_components/table-operations-dialog";

interface TableServiceRequest {
  id: string;
  type: "request_bill" | "call_waiter";
  tableId: string;
  tableNumber: number;
  tableSessionId: string;
  customerName: string;
  timestamp: number;
}

interface TableServiceRequestIndicator {
  type: "request_bill" | "call_waiter";
  customerName: string;
}

interface PendingSessionRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  started_at: string;
  table_id: string;
  table_number: number;
}

export default function TablesPage() {
  const { t, lang } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "planner">("grid");
  const [withBillOnly, setWithBillOnly] = useState(false);
  const [qrDialog, setQrDialog] = useState<any>(null);
  const [createTableDialog, setCreateTableDialog] = useState(false);
  const [createSpaceDialog, setCreateSpaceDialog] = useState(false);
  const [editSpaceDialog, setEditSpaceDialog] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "table" | "space"; id: string; name: string } | null>(null);
  const [historyDialog, setHistoryDialog] = useState<any>(null);
  const [assignDialog, setAssignDialog] = useState<any>(null);
  const [operationsDialog, setOperationsDialog] = useState<any>(null);
  const [pendingSessions, setPendingSessions] = useState<PendingSessionRequest[]>([]);
  const [serviceRequests, setServiceRequests] = useState<TableServiceRequest[]>([]);
  const [requestsDialogOpen, setRequestsDialogOpen] = useState(false);
  const { accessToken, selectedBranchId, user } = useAuthStore();
  // Chỉ admin/quản lý mới quản lý cấu trúc bàn (thêm/sửa/xóa bàn & khu vực). Thu ngân/phục vụ chỉ vận hành.
  const canManageTables = !!user && ["super_admin", "org_admin", "branch_manager"].includes(user.role);

  const [voidConfirm, setVoidConfirm] = useState<any>(null);
  const voidSession = useVoidTableSession();
  // Mô hình gắn-bàn do nhân viên thao tác → ẩn luồng khách tự quét QR (duyệt phiên + gọi phục vụ).
  const showCustomerQrFlow = false;

  // Mang về (thẻ động)
  const qc = useQueryClient();
  const { data: takeawayOrders } = useTakeawayOrders();
  const voidTakeaway = useVoidTakeaway();
  const [takeawayPay, setTakeawayPay] = useState<TakeawayOrder | null>(null);
  const [takeawayVoid, setTakeawayVoid] = useState<TakeawayOrder | null>(null);
  const takeawayList: TakeawayOrder[] = takeawayOrders ?? [];

  const takeawayCart: PosCartItem[] = (takeawayPay?.items ?? []).map((i) => ({
    lineId: i.id,
    menuItemId: i.menuItemId,
    name: i.name,
    imageUrl: null,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    notes: i.notes,
    unit: (i as any).unit,
    modifiers: i.modifiers,
  }));

  const handleTakeawayVoid = () => {
    if (!takeawayVoid) return;
    voidTakeaway.mutate(takeawayVoid.id, {
      onSuccess: () => {
        toast.success(lang === "vi" ? "Đã hủy đơn mang về (đã ghi log)" : "Takeaway voided (logged)");
        setTakeawayVoid(null);
      },
      onError: (e: any) => toast.error(e?.message || "Error"),
    });
  };

  const handleCardClick = useCallback((table: any) => {
    router.push(`/pos?tableId=${table.id}&tableNumber=${table.number}`);
  }, [router]);

  const handlePay = useCallback((table: any) => {
    router.push(`/pos?tableId=${table.id}&tableNumber=${table.number}&pay=1`);
  }, [router]);

  const handleVoidConfirm = () => {
    const sessionId = voidConfirm?.activeSession?.id;
    if (!sessionId) return;
    voidSession.mutate(sessionId, {
      onSuccess: () => {
        toast.success(lang === "vi" ? "Đã hủy & giải phóng bàn (đã ghi log)" : "Table voided & freed (logged)");
        setVoidConfirm(null);
      },
      onError: (e: any) => toast.error(e?.message || "Error"),
    });
  };

  // Data hooks
  const { data: spacesData, isLoading: spacesLoading } = useSpaces();
  const { data: tablesData, isLoading: tablesLoading, error, refetch } = useTables();
  const updateTableStatus = useUpdateTableStatus();
  const deleteTable = useDeleteTable();
  const deleteSpace = useDeleteSpace();
  const { data: pendingData, refetch: refetchPendingSessions } = usePendingSessions();
  const approveSession = useApproveSession();
  const rejectSession = useRejectSession();
  const { data: branchSettingsData } = useBranchSettings();

  const waiterAssignmentEnabled = (branchSettingsData as any)?.settings?.waiter_table_assignment_enabled ?? false;
  const spaces: any[] = spacesData ?? [];
  const allTables: any[] = tablesData?.tables ?? [];
  const branchSlug: string = tablesData?.branchSlug ?? "";
  const isLoading = spacesLoading || tablesLoading;
  const currentTableIds = useMemo(
    () => new Set(allTables.map((table: any) => String(table.id))),
    [allTables]
  );

  useEffect(() => {
    setPendingSessions((pendingData ?? []) as PendingSessionRequest[]);
  }, [pendingData]);

  const zoneTables = useMemo(() => {
    if (activeTab === "all") return allTables;
    if (activeTab === "unassigned") return allTables.filter((t: any) => !t.space_id);
    return allTables.filter((t: any) => t.space_id === activeTab);
  }, [allTables, activeTab]);

  const filteredTables = useMemo(
    () => (withBillOnly ? zoneTables.filter((t: any) => t.activeSession) : zoneTables),
    [zoneTables, withBillOnly]
  );

  const counts = {
    total: allTables.length,
    available: allTables.filter((t: any) => t.status === "available").length,
    occupied: allTables.filter((t: any) => t.status === "occupied").length,
    reserved: allTables.filter((t: any) => t.status === "reserved").length,
  };

  const requestByTableId = useMemo<Record<string, TableServiceRequestIndicator>>(() => {
    const latestByTable = new Map<string, TableServiceRequest>();
    for (const request of serviceRequests) {
      const current = latestByTable.get(request.tableId);
      if (!current || request.timestamp > current.timestamp) {
        latestByTable.set(request.tableId, request);
      }
    }

    const result: Record<string, TableServiceRequestIndicator> = {};
    for (const [tableId, request] of latestByTable.entries()) {
      result[tableId] = {
        type: request.type,
        customerName: request.customerName,
      };
    }

    return result;
  }, [serviceRequests]);

  const requestSummary = useMemo(() => {
    const requestBillCount = serviceRequests.filter(
      (request) => request.type === "request_bill"
    ).length;
    const callWaiterCount = serviceRequests.filter(
      (request) => request.type === "call_waiter"
    ).length;
    return {
      total: serviceRequests.length,
      requestBillCount,
      callWaiterCount,
    };
  }, [serviceRequests]);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === "auth:success") {
      void refetchPendingSessions();
      return;
    }

    if (msg.type === "session:pending") {
      const payload = msg.payload as {
        sessionId: string;
        tableId: string;
        tableNumber: number;
        customerName?: string;
      };

      if (!currentTableIds.has(String(payload.tableId))) {
        return;
      }

      setPendingSessions((prev) => {
        if (prev.some((session) => session.id === payload.sessionId)) {
          return prev;
        }
        return [
          {
            id: payload.sessionId,
            customer_name: payload.customerName || t("pos.customerPOS"),
            customer_phone: null,
            started_at: new Date(msg.timestamp).toISOString(),
            table_id: payload.tableId,
            table_number: payload.tableNumber,
          },
          ...prev,
        ];
      });
      return;
    }

    if (msg.type === "session:approved" || msg.type === "session:rejected") {
      const payload = msg.payload as { sessionId: string };
      setPendingSessions((prev) =>
        prev.filter((session) => session.id !== payload.sessionId)
      );
      return;
    }

    if (
      msg.type === "table:status" ||
      msg.type === "session:started" ||
      msg.type === "session:ended" ||
      msg.type === "table:layout_changed"
    ) {
      void refetch();
      return;
    }

    if (msg.type !== "table:request_bill" && msg.type !== "table:call_waiter") {
      return;
    }

    const payload = msg.payload as {
      tableId: string;
      tableNumber: number;
      tableSessionId: string;
      customerName?: string;
    };

    const requestType: TableServiceRequest["type"] =
      msg.type === "table:request_bill" ? "request_bill" : "call_waiter";
    const requestId = `${payload.tableSessionId}:${requestType}`;

    setServiceRequests((prev) => {
      if (prev.some((request) => request.id === requestId)) {
        return prev;
      }
      return [
        {
          id: requestId,
          type: requestType,
          tableId: payload.tableId,
          tableNumber: payload.tableNumber,
          tableSessionId: payload.tableSessionId,
          customerName: payload.customerName || t("pos.customerPOS"),
          timestamp: msg.timestamp,
        },
        ...prev,
      ].slice(0, 25);
    });

    toast.info(
      requestType === "request_bill"
        ? `${t("tables.title")} ${payload.tableNumber}: ${payload.customerName || t("pos.customerPOS")} ${t("customer.requestBill").toLowerCase()}`
        : `${t("tables.title")} ${payload.tableNumber}: ${payload.customerName || t("pos.customerPOS")} ${t("customer.callingStaff").toLowerCase()}`
    );
  }, [currentTableIds, refetchPendingSessions, t]);

  useWebSocket(
    selectedBranchId ? [`branch:${selectedBranchId}`] : [],
    handleWsMessage,
    accessToken || undefined
  );

  const dismissServiceRequest = (id: string) => {
    setServiceRequests((prev) => prev.filter((request) => request.id !== id));
  };

  const clearServiceRequests = () => {
    setServiceRequests([]);
  };

  const handleStatusChange = (tableId: string, newStatus: string) => {
    updateTableStatus.mutate({ id: tableId, status: newStatus });
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "table") {
      deleteTable.mutate(deleteConfirm.id, {
        onSuccess: () => setDeleteConfirm(null),
      });
    } else {
      deleteSpace.mutate(deleteConfirm.id, {
        onSuccess: () => {
          setDeleteConfirm(null);
          if (activeTab === deleteConfirm.id) setActiveTab("all");
        },
      });
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("tables.title")}</h1>
        </div>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">
            {t("tables.errorLoad")}: {(error as Error).message}
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
    <div className="space-y-3">
      {/* Header */}
      <PageHeader
        title={`${t("tables.title")} & ${t("tables.spaces")}`}
        description={
          isLoading
            ? t("common.loading")
            : `${counts.available} ${t("tables.free").toLowerCase()}, ${counts.occupied} ${t("tables.occupied").toLowerCase()} ${lang === "vi" ? "trong số" : "of"} ${counts.total} ${t("tables.tablesCount")}`
        }
        actions={
          <>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "planner" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode("planner")}
              >
                <MapIcon className="h-4 w-4" />
              </Button>
            </div>
            {canManageTables && (
              <>
                <Button variant="outline" onClick={() => setCreateSpaceDialog(true)}>
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  {t("tables.addSpace")}
                </Button>
                <Button onClick={() => setCreateTableDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("tables.addTable")}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Dòng tổng gọn kiểu iPOS (thay 4 thẻ thống kê để dành chỗ cho sơ đồ bàn) */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {lang === "vi" ? "Toàn quán" : "All areas"}:{" "}
          <span className="font-bold text-foreground">
            {lang === "vi" ? "Trống" : "Free"} {counts.available}/{counts.total}{" "}
            {lang === "vi" ? "bàn" : "tables"}
          </span>
          {counts.reserved > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}· {lang === "vi" ? "Đặt trước" : "Reserved"}: {counts.reserved}
            </span>
          )}
          {activeTab !== "all" && (
            <>
              {" "}—{" "}
              <span className="font-bold text-foreground">
                {activeTab === "unassigned"
                  ? t("tables.unassigned")
                  : spaces.find((s: any) => s.id === activeTab)?.name}
              </span>
              : {lang === "vi" ? "Trống" : "Free"}{" "}
              <span className="font-bold text-foreground">
                {zoneTables.filter((tb: any) => tb.status === "available").length}/{zoneTables.length}{" "}
                {lang === "vi" ? "bàn" : "tables"}
              </span>
            </>
          )}
        </p>
      )}

      {/* Pending Session Requests */}
      {showCustomerQrFlow && pendingSessions.length > 0 && (
        <Card className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" />
              {t("tables.pendingRequests")} ({pendingSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingSessions.map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background border"
                >
                  <div>
                    <p className="font-medium">{session.customer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("tables.title")} {session.table_number}
                      {session.customer_phone && ` · ${session.customer_phone}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={rejectSession.isPending}
                      onClick={() => rejectSession.mutate(session.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={approveSession.isPending}
                      onClick={() => approveSession.mutate(session.id)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {t("common.confirm")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table service requests summary */}
      {showCustomerQrFlow && serviceRequests.length > 0 && (
        <Card className="border-2 border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-medium">
                {t("tables.activeRequests")}: {requestSummary.total}
              </p>
              <Badge variant="outline">{t("customer.requestBill")}: {requestSummary.requestBillCount}</Badge>
              <Badge variant="outline">{t("nav.role_waiter")}: {requestSummary.callWaiterCount}</Badge>
            </div>
            <Button size="sm" onClick={() => setRequestsDialogOpen(true)}>
              {t("tables.tableRequests")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs: All / Per Space / Unassigned */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabsList className="h-11">
              <TabsTrigger value="all" className="h-9 px-4 text-sm font-semibold">
                {t("tables.all")}
              </TabsTrigger>
              {spaces.map((space: any) => (
                <TabsTrigger key={space.id} value={space.id} className="h-9 px-4 text-sm font-semibold">
                  {space.name}
                </TabsTrigger>
              ))}
              <TabsTrigger value="unassigned" className="h-9 px-4 text-sm font-semibold">
                {t("tables.unassigned")}
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Lọc bàn có hóa đơn (kiểu iPOS) */}
          <button
            type="button"
            role="switch"
            aria-checked={withBillOnly}
            onClick={() => setWithBillOnly((v) => !v)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
              withBillOnly
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors",
                withBillOnly ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  withBillOnly ? "translate-x-4" : "translate-x-0"
                )}
              />
            </span>
            <span className="hidden sm:inline whitespace-nowrap">
              {lang === "vi" ? "Bàn có hóa đơn" : "With bill"}
            </span>
          </button>
        </div>

        {/* Space info card */}
        {activeTab !== "all" && activeTab !== "unassigned" && (() => {
          const currentSpace = spaces.find((s: any) => s.id === activeTab);
          if (!currentSpace) return null;
          return (
            <SpaceInfoCard
              space={currentSpace}
              tableCount={filteredTables.length}
              canManage={canManageTables}
              onEdit={() => setEditSpaceDialog(currentSpace)}
              onDelete={() =>
                setDeleteConfirm({
                  type: "space",
                  id: currentSpace.id,
                  name: currentSpace.name,
                })
              }
            />
          );
        })()}

        {/* View: Grid or Floor Planner */}
        {viewMode === "planner" ? (
          <div className="mt-4">
            <FloorPlannerView
              tables={filteredTables}
              requestByTableId={requestByTableId}
            />
          </div>
        ) : (
          <GridView
            tables={filteredTables}
            isLoading={isLoading}
            canManage={canManageTables}
            waiterAssignmentEnabled={waiterAssignmentEnabled}
            statusChangePending={updateTableStatus.isPending}
            requestByTableId={requestByTableId}
            onQr={setQrDialog}
            onHistory={setHistoryDialog}
            onAssign={setAssignDialog}
            onOperations={setOperationsDialog}
            onDelete={(table) =>
              setDeleteConfirm({ type: "table", id: table.id, name: `${t("tables.title")} ${table.number}` })
            }
            onStatusChange={handleStatusChange}
            onCardClick={handleCardClick}
            onPay={handlePay}
            onVoid={setVoidConfirm}
          />
        )}
      </Tabs>

      {/* Mang về (thẻ động) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            {lang === "vi" ? "Mang về" : "Takeaway"}
            {takeawayList.length > 0 && (
              <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold">
                {takeawayList.length}
              </span>
            )}
          </h2>
          <Button size="sm" onClick={() => router.push("/pos?takeout=1")}>
            <Plus className="h-4 w-4 mr-1" />
            {lang === "vi" ? "Đơn mang về" : "New takeaway"}
          </Button>
        </div>

        {takeawayList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === "vi" ? "Chưa có đơn mang về đang mở." : "No open takeaway orders."}
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {takeawayList.map((o) => (
              <div key={o.id} className="rounded-2xl p-4 flex flex-col gap-2 bg-card border">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    #{o.order_number}
                  </span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {formatCurrency(o.total)}
                  </span>
                </div>
                <p className="text-xs font-medium truncate text-muted-foreground">
                  {o.customer_name || (lang === "vi" ? "Khách lẻ" : "Walk-in")}
                </p>
                {o.itemSummary && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                    {o.itemSummary}
                  </p>
                )}
                <div className="flex gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    onClick={() => setTakeawayVoid(o)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    {lang === "vi" ? "Hủy" : "Void"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTakeawayPay(o)}
                    className="flex-1 text-xs font-bold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {lang === "vi" ? "Thanh toán" : "Pay"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={requestsDialogOpen} onOpenChange={setRequestsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("tables.tableRequests")} ({serviceRequests.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {serviceRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("tables.noActiveRequests")}
              </p>
            ) : (
              serviceRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background border"
                >
                  <div>
                    <p className="font-medium">{t("tables.title")} {request.tableNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.customerName} ·{" "}
                      {request.type === "request_bill"
                        ? t("customer.requestBill")
                        : t("customer.callingStaff")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {new Date(request.timestamp).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Badge>
                    <Button size="sm" onClick={() => dismissServiceRequest(request.id)}>
                      {t("tables.dismiss")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {serviceRequests.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={clearServiceRequests}>
                {t("tables.clearAll")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <QrDialog table={qrDialog} branchSlug={branchSlug} onClose={() => setQrDialog(null)} />
      <CreateTableDialog open={createTableDialog} onOpenChange={setCreateTableDialog} spaces={spaces} />
      <CreateSpaceDialog open={createSpaceDialog} onOpenChange={setCreateSpaceDialog} />
      <EditSpaceDialog space={editSpaceDialog} onClose={() => setEditSpaceDialog(null)} />
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title={t("tables.confirmDelete")}
        description={
          deleteConfirm?.type === "space"
            ? t("tables.deleteSpaceConfirm")
            : t("tables.deleteTableConfirm")
        }
        onConfirm={handleDelete}
        loading={deleteTable.isPending || deleteSpace.isPending}
      />
      <ConfirmDialog
        open={!!voidConfirm}
        onOpenChange={(open) => !open && setVoidConfirm(null)}
        title={lang === "vi" ? "Hủy bàn & hủy đơn chưa thanh toán?" : "Void table & cancel unpaid orders?"}
        description={
          lang === "vi"
            ? `Sẽ hủy các đơn CHƯA thanh toán của ${voidConfirm?.activeSession?.customerName || "bàn này"} và giải phóng bàn. Hành động được ghi log. Không hoàn tác được.`
            : "Cancels all UNPAID orders for this table and frees it. This action is logged and cannot be undone."
        }
        confirmLabel={lang === "vi" ? "Hủy bàn" : "Void"}
        onConfirm={handleVoidConfirm}
        loading={voidSession.isPending}
      />
      <ConfirmDialog
        open={!!takeawayVoid}
        onOpenChange={(open) => !open && setTakeawayVoid(null)}
        title={lang === "vi" ? "Hủy đơn mang về?" : "Void takeaway order?"}
        description={
          lang === "vi"
            ? `Hủy đơn #${takeawayVoid?.order_number || ""} (${formatCurrency(takeawayVoid?.total || 0)}). Hành động được ghi log, không hoàn tác.`
            : "Cancels this takeaway order. Logged, cannot be undone."
        }
        confirmLabel={lang === "vi" ? "Hủy đơn" : "Void"}
        onConfirm={handleTakeawayVoid}
        loading={voidTakeaway.isPending}
      />
      {takeawayPay && (
        <PosPaymentDialog
          open={!!takeawayPay}
          onOpenChange={(open) => !open && setTakeawayPay(null)}
          orderId={takeawayPay.id}
          orderNumber={takeawayPay.order_number}
          totalAmount={takeawayPay.total}
          taxAmount={takeawayPay.tax}
          cart={takeawayCart}
          customerName={takeawayPay.customer_name || undefined}
          onSuccess={() => {
            setTakeawayPay(null);
            qc.invalidateQueries({ queryKey: ["tables", "takeaway"] });
          }}
        />
      )}
      <HistoryDialog table={historyDialog} onClose={() => setHistoryDialog(null)} />
      <AssignmentDialog table={assignDialog} onClose={() => setAssignDialog(null)} />
      <TableOperationsDialog
        table={operationsDialog}
        tables={allTables}
        open={!!operationsDialog}
        onOpenChange={(open) => !open && setOperationsDialog(null)}
      />
    </div>
  );
}
