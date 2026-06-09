"use client";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import {
  QrCode,
  Trash2,
  History,
  UserPlus,
  Circle,
  BellRing,
  ArrowRightLeft,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

interface TableServiceRequestIndicator {
  type: "request_bill" | "call_waiter";
  customerName: string;
}

interface TableCardProps {
  table: any;
  waiterAssignmentEnabled: boolean;
  statusChangePending: boolean;
  serviceRequest?: TableServiceRequestIndicator;
  onQr: (table: any) => void;
  onHistory: (table: any) => void;
  onAssign: (table: any) => void;
  onDelete: (table: any) => void;
  onOperations?: (table: any) => void;
  onStatusChange: (tableId: string, status: string) => void;
  onCardClick?: (table: any) => void;
}

const STATUS_METADATA: Record<
  string,
  {
    bg: string;
    text: string;
    number: string;
    actionTarget?: string;
    actionBg: string;
  }
> = {
  available: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    number: "text-emerald-900 dark:text-emerald-100",
    actionTarget: "occupied",
    actionBg: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  occupied: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    number: "text-blue-900 dark:text-blue-100",
    actionTarget: "available",
    actionBg: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  reserved: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    number: "text-amber-900 dark:text-amber-100",
    actionBg: "",
  },
  maintenance: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    number: "text-red-900 dark:text-red-100",
    actionBg: "",
  },
};

export function TableCard({
  table,
  waiterAssignmentEnabled,
  statusChangePending,
  serviceRequest,
  onQr,
  onHistory,
  onAssign,
  onDelete,
  onOperations,
  onStatusChange,
  onCardClick,
}: TableCardProps) {
  const { t, lang } = useTranslation();
  const meta = STATUS_METADATA[table.status] || STATUS_METADATA.available;
  const hasServiceRequest = !!serviceRequest;

  const requestAccent =
    serviceRequest?.type === "request_bill"
      ? "ring-2 ring-blue-500/70"
      : "ring-2 ring-orange-500/70";

  const requestLabel =
    serviceRequest?.type === "request_bill"
      ? t("customer.requestBill")
      : t("customer.callingStaff");

  const statusLabel = t(`tables.${table.status === "available" ? "free" : table.status}`);

  const actionLabel =
    meta.actionTarget === "occupied"
      ? t("tables.occupy")
      : meta.actionTarget === "available"
      ? t("tables.freeTable")
      : "";

  const statusOptions = [
    { value: "available", label: t("tables.free") },
    { value: "occupied", label: t("tables.occupied") },
    { value: "reserved", label: t("tables.reserved") },
    { value: "maintenance", label: t("tables.maintenance") },
  ];

  return (
    <div
      onClick={() => onCardClick?.(table)}
      className={cn(
        "rounded-2xl p-4 flex flex-col gap-3 transition-shadow duration-200 hover:shadow-lg cursor-pointer select-none",
        meta.bg,
        hasServiceRequest && requestAccent
      )}
    >
      {/* Header: number + status */}
      <div className="flex items-center justify-between">
        <p className={cn("text-[2.5rem] font-black leading-none tracking-tight tabular-nums", meta.number)}>
          {table.number}
        </p>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10", meta.text)}>
            {statusLabel}
          </span>
          {serviceRequest && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                serviceRequest.type === "request_bill"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
              )}
            >
              <BellRing className="h-3 w-3" />
              {requestLabel}
            </span>
          )}
        </div>
      </div>

      {/* Capacity */}
      <p className="text-xs text-muted-foreground -mt-1 font-medium">
        {table.capacity} {table.capacity === 1 ? t("tables.person") : t("tables.people")}
      </p>

      {/* Active Session Info */}
      {table.activeSession && (
        <div className="mt-1 p-2 rounded-lg bg-background/60 dark:bg-background/25 border text-xs space-y-1 animate-in fade-in duration-200">
          <div className="flex justify-between font-semibold">
            <span className="truncate text-muted-foreground">
              {lang === "vi" ? "Khách" : "Guest"}: {table.activeSession.customerName}
            </span>
            <span className="text-primary tabular-nums shrink-0">
              {formatCurrency(table.activeSession.total)}
            </span>
          </div>
          {table.activeSession.itemSummary && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed italic border-t pt-1 mt-1">
              {table.activeSession.itemSummary}
            </p>
          )}
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-1 mt-auto" onClick={(e) => e.stopPropagation()}>
        <IconBtn icon={<QrCode className="h-3.5 w-3.5" />} title="QR" onClick={() => onQr(table)} />
        <IconBtn icon={<History className="h-3.5 w-3.5" />} title={t("tables.history")} onClick={() => onHistory(table)} />
        {waiterAssignmentEnabled && (
          <IconBtn icon={<UserPlus className="h-3.5 w-3.5" />} title={t("tables.assign")} onClick={() => onAssign(table)} />
        )}
        {table.activeSession && onOperations && (
          <IconBtn
            icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
            title="Chuyển / gộp / tách bàn"
            onClick={() => onOperations(table)}
          />
        )}

        <div className="flex-1" />

        {actionLabel && meta.actionTarget && (
          <button
            type="button"
            disabled={statusChangePending}
            onClick={() => onStatusChange(table.id, meta.actionTarget!)}
            className={cn(
              "text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50",
              meta.actionBg
            )}
          >
            {actionLabel}
          </button>
        )}

        <IconBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          title={t("common.delete")}
          onClick={() => onDelete(table)}
          destructive
        />
      </div>

      {/* Status selector */}
      <div onClick={(e) => e.stopPropagation()}>
        <Select value={table.status} onValueChange={(v) => onStatusChange(table.id, v)}>
          <SelectTrigger className="h-7 text-xs bg-white/50 dark:bg-white/5 border-0 shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  <Circle className={cn("h-2 w-2 fill-current", STATUS_METADATA[opt.value]?.text)} />
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        destructive
          ? "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
          : "text-muted-foreground/80 hover:text-foreground hover:bg-white/60 dark:hover:bg-white/10"
      )}
    >
      {icon}
    </button>
  );
}
