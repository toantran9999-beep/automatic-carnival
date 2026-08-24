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
  Clock,
} from "lucide-react";
import { ActionsMenu, type ActionItem } from "@/components/actions-menu";
import { cn, formatCurrency, formatElapsed } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

interface TableServiceRequestIndicator {
  type: "request_bill" | "call_waiter";
  customerName: string;
}

interface TableCardProps {
  table: any;
  /** Mốc thời gian hiện tại từ GridView (1 interval chung) để tính thời gian ngồi */
  now?: number;
  canManage?: boolean;
  /**
   * Được đụng dữ liệu đang bán hàng không (mở bàn, thanh toán, huỷ, gộp/tách,
   * đổi trạng thái). Quản lý/admin = false → thẻ thành CHỈ XEM.
   * ⚠️ Ngược dấu với `canManage` (quản lý MỚI được xoá bàn) — đừng trộn hai cái.
   */
  canOperate?: boolean;
  /** Ẩn nút QR bàn (quán không dùng luồng khách tự quét) */
  hideQr?: boolean;
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
  onPay?: (table: any) => void;
  onVoid?: (table: any) => void;
}

/**
 * Tên khách do hệ thống tự điền khi mở bàn từ máy POS — không phải tên khách thật,
 * nên không đáng chiếm một dòng trên thẻ bàn.
 */
const DEFAULT_CUSTOMER_NAMES = ["khách pos", "pos staff", "khách lẻ", "walk-in"];

function isDefaultCustomerName(name?: string | null): boolean {
  if (!name) return true;
  return DEFAULT_CUSTOMER_NAMES.includes(name.trim().toLowerCase());
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
    // Bàn trống = nền trung tính/trắng, lùi lại cho bàn có khách nổi lên
    bg: "bg-card border border-border dark:bg-card",
    text: "text-muted-foreground",
    number: "text-foreground/70 dark:text-foreground/70",
    actionTarget: "occupied",
    actionBg: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  occupied: {
    // Bàn có khách = tô xanh đậm + viền dày 2px + đổ bóng để nổi bật hẳn so với bàn trống
    bg: "bg-blue-200/80 border-2 border-blue-500 shadow-sm dark:bg-blue-900/60 dark:border-blue-400",
    text: "text-blue-800 dark:text-blue-200",
    number: "text-blue-900 dark:text-blue-50",
    actionTarget: "available",
    actionBg: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  reserved: {
    bg: "bg-amber-100 border border-amber-300 dark:bg-amber-900/40 dark:border-amber-700",
    text: "text-amber-700 dark:text-amber-300",
    number: "text-amber-900 dark:text-amber-100",
    actionBg: "",
  },
  maintenance: {
    bg: "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800/50",
    text: "text-red-700 dark:text-red-300",
    number: "text-red-900 dark:text-red-100",
    actionBg: "",
  },
};

export function TableCard({
  table,
  now,
  canManage,
  canOperate = true,
  hideQr,
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
  onPay,
  onVoid,
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

  // Chỉ giữ đúng những mục thao tác được — thứ tự theo tần suất dùng trong ca.
  const actions: ActionItem[] = [
    ...(hideQr ? [] : [{ key: "qr", label: "QR bàn", icon: QrCode, onSelect: () => onQr(table) }]),
    { key: "history", label: t("tables.history"), icon: History, onSelect: () => onHistory(table) },
    ...(waiterAssignmentEnabled
      ? [{ key: "assign", label: t("tables.assign"), icon: UserPlus, onSelect: () => onAssign(table) }]
      : []),
    ...(table.activeSession && onOperations && canOperate
      ? [{
          key: "ops",
          label: lang === "vi" ? "Chuyển / gộp / tách bàn" : "Move / merge / split",
          icon: ArrowRightLeft,
          onSelect: () => onOperations(table),
        }]
      : []),
    ...(canManage
      ? [{ key: "delete", label: t("common.delete"), icon: Trash2, onSelect: () => onDelete(table), destructive: true }]
      : []),
  ];

  return (
    <div
      onClick={() => canOperate && onCardClick?.(table)}
      className={cn(
        // min-h: sàn tối thiểu đặt xấp xỉ chiều cao thẻ lúc CÓ khách, để khu chưa mở bàn
        // nào vẫn cao gần bằng lúc có khách — không có nó thì mở bàn đầu tiên là cả lưới
        // nhảy lên một nhịp. Điện thoại thấp hơn vì dòng chi tiết món bị ẩn (hidden sm:block).
        "rounded-2xl p-3 sm:p-4 min-h-[15rem] sm:min-h-[18rem] flex flex-col gap-2.5 sm:gap-3 transition-shadow duration-200 hover:shadow-lg select-none",
        canOperate ? "cursor-pointer" : "cursor-default",
        meta.bg,
        hasServiceRequest && requestAccent
      )}
    >
      {/* Header: number + status */}
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-3xl sm:text-[2.5rem] font-black leading-none tracking-tight tabular-nums", meta.number)}>
          {table.number}
        </p>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10", meta.text)}>
            {statusLabel}
          </span>
          {/* Thời gian ngồi (kiểu iPOS: 54p, 1h26p) */}
          {table.activeSession?.startedAt && (
            <span className={cn("inline-flex items-center gap-1 text-xs font-bold tabular-nums", meta.text)}>
              <Clock className="h-3.5 w-3.5" />
              {formatElapsed(table.activeSession.startedAt, now ?? Date.now())}
            </span>
          )}
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

      {/* Active Session Info — tiền TO rõ + danh sách món.
          Sức chứa bàn đã bỏ: thông tin tĩnh, không giúp gì lúc chạy bàn. */}
      {table.activeSession && (
        <div className="mt-1 p-2 rounded-lg bg-background/60 dark:bg-background/25 border space-y-1 animate-in fade-in duration-200">
          {/* Chỉ hiện khi nhân viên GÕ TÊN THẬT. Tên mặc định ("Khách POS") là rác
              màn hình — nhưng xoá thẳng cả dòng thì mất luôn ghi chú thật kiểu
              "Anh Hùng hẹn 3h", mà đó đúng là chỗ để nhận ra khách. */}
          {!isDefaultCustomerName(table.activeSession.customerName) && (
            <span className="block min-w-0 truncate text-xs font-semibold text-foreground/75">
              {table.activeSession.customerName}
            </span>
          )}
          <span className="block text-lg font-bold text-primary tabular-nums leading-tight">
            {formatCurrency(table.activeSession.total)}
          </span>
          {table.activeSession.itemSummary && (
            <span className="hidden sm:block border-t pt-1 mt-1">
              {/* ⚠️ KHÔNG dùng text-muted-foreground: đó là màu chữ phụ tính cho nền
                  trắng, đặt lên thẻ bàn có khách (nền xanh đậm) là chìm hẳn. */}
              <span className="line-clamp-2 text-xs leading-relaxed text-foreground/75">
                {table.activeSession.itemSummary}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Thao tác phụ — gom vào một nút ⋮.
          ⚠️ Trước đây là hàng tối đa 5 nút icon trần 28×28. Thẻ bàn ở 1280px chỉ
          rộng ~166px sau khi trừ đệm, nên KHÔNG có cách nào nhồi 5 vùng bấm đủ
          chuẩn 44px (=220px) vào đó — phóng to là tràn, giữ nguyên là bấm trượt.
          Gom lại thì vừa đủ to, vừa có chữ đi kèm thay cho icon trần đoán mò. */}
      <div className="flex items-center justify-end -mr-1 -my-1 mt-auto" onClick={(e) => e.stopPropagation()}>
        <ActionsMenu label={t("common.actions")} items={actions} triggerClassName="text-foreground/70 hover:bg-white/60 dark:hover:bg-white/10" />
      </div>

      {/* Primary actions: theo trạng thái đơn.
          Quản lý/admin (canOperate=false) không thấy hàng này — thông tin bàn và
          tiền vẫn hiện đầy đủ ở trên, chỉ là không đụng vào được. */}
      {!canOperate ? (
        <p className="mt-auto text-[11px] italic text-muted-foreground">
          {lang === "vi" ? "Chế độ chỉ xem" : "View only"}
        </p>
      ) : table.activeSession ? (
        /* Bàn đang có đơn → chỉ đóng bằng Thanh toán hoặc Hủy (có log). KHÔNG đổi status thô để khỏi bỏ rơi đơn. */
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onVoid?.(table)}
            className="h-11 shrink-0 text-sm font-semibold px-3 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
          >
            {lang === "vi" ? "Hủy bàn" : "Void"}
          </button>
          <button
            type="button"
            onClick={() => onPay?.(table)}
            className="h-11 flex-1 text-sm font-bold px-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {/* Không lặp lại số tiền: nó đã nằm to rõ màu vàng ở khối giữa thẻ —
                chỗ đọc được từ xa khi lướt cả dãy bàn. */}
            {lang === "vi" ? "Thanh toán" : "Pay"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          {table.status === "available" && (
            <button
              type="button"
              onClick={() => onCardClick?.(table)}
              className="h-11 flex-1 text-sm font-bold px-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {lang === "vi" ? "Mở bàn" : "Open"}
            </button>
          )}
          <Select value={table.status} onValueChange={(v) => onStatusChange(table.id, v)}>
            <SelectTrigger className="h-11 w-auto text-sm bg-white/50 dark:bg-white/5 border-0 shadow-none">
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
      )}
    </div>
  );
}
