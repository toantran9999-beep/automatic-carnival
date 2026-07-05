"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Lock, LockOpen, Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import { useOpenShift, useCloseShift, type CurrentShift } from "@/hooks/use-shifts";
import { usePrintShiftReport } from "@/components/print-ticket";
import { useBranchSettings } from "@/hooks/use-settings";

/** Người dùng nhập số tiền theo đồng (VND) → quy về cents (×100) để lưu. */
function vndToCents(s: string): number {
  const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n * 100 : 0;
}

function methodLabel(m: string, vi: boolean): string {
  const map: Record<string, string> = vi
    ? { cash: "Tiền mặt", card: "Thẻ", transfer: "Chuyển khoản", yape: "QR ngân hàng", plin: "Ví điện tử", other: "Khác" }
    : { cash: "Cash", card: "Card", transfer: "Transfer", yape: "Bank QR", plin: "E-wallet", other: "Other" };
  return map[m] || m;
}

export function OpenShiftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { lang } = useTranslation();
  const vi = lang === "vi";
  const openShift = useOpenShift();
  const [cash, setCash] = useState("");

  const submit = () => {
    openShift.mutate(
      { openingCash: vndToCents(cash) },
      {
        onSuccess: () => {
          toast.success(vi ? "Đã mở ca làm việc" : "Shift opened");
          setCash("");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message || "Error"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5" />
            {vi ? "Mở ca làm việc" : "Open shift"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="openingCash">{vi ? "Tiền mặt đầu ca (đ)" : "Opening cash (đ)"}</Label>
            <Input
              id="openingCash"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Số tiền mặt có sẵn trong két khi bắt đầu ca."
                : "Cash already in the drawer at the start of the shift."}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={openShift.isPending}>
              {vi ? "Hủy" : "Cancel"}
            </Button>
            <Button onClick={submit} disabled={openShift.isPending}>
              {openShift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (vi ? "Mở ca" : "Open")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CloseShiftDialog({
  open,
  onOpenChange,
  shift,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: CurrentShift | null;
}) {
  const { lang } = useTranslation();
  const vi = lang === "vi";
  const closeShift = useCloseShift();
  const printReport = usePrintShiftReport();
  const { data: branchSettings } = useBranchSettings();
  const [cash, setCash] = useState("");

  if (!shift) return null;
  const s = shift.summary;
  const closingCents = vndToCents(cash);
  const diff = closingCents - s.expectedCash;

  const submit = (alsoPrint: boolean) => {
    closeShift.mutate(
      { closingCash: closingCents },
      {
        onSuccess: (closed: any) => {
          toast.success(vi ? "Đã đóng ca" : "Shift closed");
          if (alsoPrint) {
            printReport({
              businessName: (branchSettings as any)?.name || "Toda Café",
              openedAt: shift.opened_at,
              closedAt: closed?.closed_at || new Date().toISOString(),
              openingCash: shift.opening_cash,
              cashSales: s.cashSales,
              totalSales: s.totalSales,
              orderCount: s.orderCount,
              expectedCash: s.expectedCash,
              closingCash: closingCents,
              difference: diff,
              byMethod: s.byMethod,
            });
          }
          setCash("");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message || "Error"),
      },
    );
  };

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between ${strong ? "font-bold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={strong ? "" : "text-foreground"}>{value}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {vi ? "Đóng ca làm việc" : "Close shift"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1 rounded-lg border p-3">
            <Row label={vi ? "Số đơn" : "Orders"} value={String(s.orderCount)} />
            {Object.entries(s.byMethod).map(([m, amt]) => (
              <Row key={m} label={methodLabel(m, vi)} value={formatCurrency(amt as number)} />
            ))}
            <div className="border-t pt-1 mt-1">
              <Row label={vi ? "Tổng doanh thu" : "Total sales"} value={formatCurrency(s.totalSales)} strong />
            </div>
          </div>

          <div className="space-y-1 rounded-lg border p-3">
            <Row label={vi ? "Tiền đầu ca" : "Opening cash"} value={formatCurrency(shift.opening_cash)} />
            <Row label={vi ? "Thu tiền mặt" : "Cash sales"} value={formatCurrency(s.cashSales)} />
            <Row label={vi ? "Tiền mặt kỳ vọng" : "Expected cash"} value={formatCurrency(s.expectedCash)} strong />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="closingCash">{vi ? "Tiền mặt đếm thực tế (đ)" : "Counted cash (đ)"}</Label>
            <Input
              id="closingCash"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
          </div>

          {cash !== "" && (
            <div
              className={`rounded-lg border p-3 text-center font-semibold ${
                diff === 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20"
                  : diff > 0
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20"
                    : "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/20"
              }`}
            >
              {diff === 0
                ? (vi ? "Khớp quỹ" : "Balanced")
                : `${vi ? (diff > 0 ? "Thừa" : "Thiếu") : diff > 0 ? "Over" : "Short"}: ${formatCurrency(Math.abs(diff))}`}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={closeShift.isPending}>
              {vi ? "Hủy" : "Cancel"}
            </Button>
            <Button variant="outline" onClick={() => submit(true)} disabled={closeShift.isPending || cash === ""}>
              <Receipt className="mr-1.5 h-4 w-4" />
              {vi ? "Đóng & in" : "Close & print"}
            </Button>
            <Button onClick={() => submit(false)} disabled={closeShift.isPending || cash === ""}>
              {closeShift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (vi ? "Đóng ca" : "Close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Thanh trạng thái ca (hiện trên POS khi ca đang mở). */
export function ShiftBar({ shift, canManage }: { shift: CurrentShift; canManage: boolean }) {
  const { lang } = useTranslation();
  const vi = lang === "vi";
  const [closeOpen, setCloseOpen] = useState(false);
  const openedTime = new Date(shift.opened_at).toLocaleTimeString(vi ? "vi-VN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs dark:border-emerald-800/50 dark:bg-emerald-950/20">
      <span className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {vi ? `Ca mở lúc ${openedTime}` : `Shift since ${openedTime}`}
        <span className="text-emerald-700/70 dark:text-emerald-400/70">
          · {formatCurrency(shift.summary.totalSales)} · {shift.summary.orderCount} {vi ? "đơn" : "orders"}
        </span>
      </span>
      {canManage && (
        <Button
          size="sm"
          variant="outline"
          className="h-10 border-emerald-300 px-3 text-sm text-emerald-800 dark:text-emerald-300"
          onClick={() => setCloseOpen(true)}
        >
          <Lock className="mr-1 h-3.5 w-3.5" />
          {vi ? "Đóng ca" : "Close shift"}
        </Button>
      )}
      <CloseShiftDialog open={closeOpen} onOpenChange={setCloseOpen} shift={shift} />
    </div>
  );
}

/** Màn chặn khi chưa mở ca. */
export function ShiftClosedBlocker({ canManage }: { canManage: boolean }) {
  const { lang } = useTranslation();
  const vi = lang === "vi";
  const [openDlg, setOpenDlg] = useState(false);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-bold">{vi ? "Chưa mở ca làm việc" : "No open shift"}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {vi
          ? "Cần mở ca trước khi bán hàng. Mọi chức năng đặt món bị khóa cho tới khi mở ca."
          : "Open a shift before selling. Ordering is locked until a shift is open."}
      </p>
      {canManage ? (
        <Button size="lg" onClick={() => setOpenDlg(true)}>
          <LockOpen className="mr-2 h-5 w-5" />
          {vi ? "Mở ca" : "Open shift"}
        </Button>
      ) : (
        <p className="text-sm font-medium text-amber-600">
          {vi ? "Liên hệ thu ngân/quản lý để mở ca." : "Ask a cashier/manager to open the shift."}
        </p>
      )}
      <OpenShiftDialog open={openDlg} onOpenChange={setOpenDlg} />
    </div>
  );
}
