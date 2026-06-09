"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@restai/ui/components/select";
import { Input } from "@restai/ui/components/input";
import { ArrowRightLeft, GitMerge, Loader2, Scissors } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import {
  useMergeTableSessions,
  useSplitTableSession,
  useTableActiveSession,
  useTransferTableSession,
} from "@/hooks/use-tables";
import { toast } from "sonner";

type OperationMode = "transfer" | "merge" | "split";

export function TableOperationsDialog({
  table,
  tables,
  open,
  onOpenChange,
}: {
  table: any | null;
  tables: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useTranslation();
  const [mode, setMode] = useState<OperationMode>("transfer");
  const [targetTableId, setTargetTableId] = useState("");
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});

  const activeSessionId = table?.activeSession?.id ?? null;
  const activeSession = useTableActiveSession(open && table?.id ? table.id : null);
  const transferSession = useTransferTableSession();
  const mergeSessions = useMergeTableSessions();
  const splitSession = useSplitTableSession();

  const isPending =
    transferSession.isPending || mergeSessions.isPending || splitSession.isPending;

  useEffect(() => {
    if (!open) return;
    setMode("transfer");
    setTargetTableId("");
    setMergeSourceIds([]);
    setSplitQuantities({});
  }, [open, table?.id]);

  const availableTargets = useMemo(
    () =>
      tables.filter(
        (candidate) =>
          candidate.id !== table?.id &&
          !candidate.activeSession &&
          candidate.status !== "maintenance",
      ),
    [tables, table?.id],
  );

  const splitTargets = useMemo(
    () =>
      tables.filter(
        (candidate) =>
          candidate.id !== table?.id && candidate.status !== "maintenance",
      ),
    [tables, table?.id],
  );

  const mergeSources = useMemo(
    () =>
      tables.filter(
        (candidate) =>
          candidate.id !== table?.id &&
          candidate.activeSession &&
          candidate.status === "occupied",
      ),
    [tables, table?.id],
  );

  const splitItems = useMemo(() => {
    const orders = activeSession.data?.orders ?? [];
    return orders
      .filter((order: any) => order.status !== "completed" && order.status !== "cancelled")
      .flatMap((order: any) =>
        (order.items ?? []).map((item: any) => ({
          ...item,
          orderNumber: order.order_number,
        })),
      );
  }, [activeSession.data]);

  const selectedSplitItems = useMemo(
    () =>
      Object.entries(splitQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
    [splitQuantities],
  );

  if (!table) return null;

  const tableLabel = lang === "vi" ? `Bàn ${table.number}` : `Table ${table.number}`;

  const closeAfterSuccess = (message: string) => {
    toast.success(message);
    onOpenChange(false);
  };

  const submitTransfer = async () => {
    if (!activeSessionId || !targetTableId) {
      toast.error("Chọn bàn đích trước");
      return;
    }
    await transferSession.mutateAsync({ sessionId: activeSessionId, targetTableId });
    closeAfterSuccess("Đã chuyển bàn");
  };

  const submitMerge = async () => {
    if (!activeSessionId || mergeSourceIds.length === 0) {
      toast.error("Chọn ít nhất một bàn cần gộp");
      return;
    }
    await mergeSessions.mutateAsync({
      targetSessionId: activeSessionId,
      sourceSessionIds: mergeSourceIds,
    });
    closeAfterSuccess("Đã gộp bàn");
  };

  const submitSplit = async () => {
    if (!activeSessionId || !targetTableId || selectedSplitItems.length === 0) {
      toast.error("Chọn bàn đích và món cần tách");
      return;
    }
    await splitSession.mutateAsync({
      sessionId: activeSessionId,
      targetTableId,
      items: selectedSplitItems,
    });
    closeAfterSuccess("Đã tách món sang bàn khác");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thao tác {tableLabel}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <ModeButton
            active={mode === "transfer"}
            icon={<ArrowRightLeft className="h-4 w-4" />}
            label="Chuyển"
            onClick={() => {
              setMode("transfer");
              setTargetTableId("");
            }}
          />
          <ModeButton
            active={mode === "merge"}
            icon={<GitMerge className="h-4 w-4" />}
            label="Gộp"
            onClick={() => setMode("merge")}
          />
          <ModeButton
            active={mode === "split"}
            icon={<Scissors className="h-4 w-4" />}
            label="Tách"
            onClick={() => {
              setMode("split");
              setTargetTableId("");
            }}
          />
        </div>

        {mode === "transfer" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Chuyển toàn bộ phiên của {tableLabel} sang một bàn trống.
            </p>
            <TableSelect
              value={targetTableId}
              onValueChange={setTargetTableId}
              placeholder="Chọn bàn trống"
              tables={availableTargets}
            />
            <Button className="w-full" disabled={isPending} onClick={submitTransfer}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Chuyển bàn
            </Button>
          </div>
        )}

        {mode === "merge" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gộp các bàn đang có khách vào {tableLabel}. Các order sẽ nằm chung một bill.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border p-2">
              {mergeSources.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Không có bàn đang khách khác để gộp
                </p>
              ) : (
                mergeSources.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
                  >
                    <span className="text-sm font-medium">
                      Bàn {candidate.number}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatCurrency(candidate.activeSession?.total ?? 0)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={mergeSourceIds.includes(candidate.activeSession.id)}
                      onChange={(event) => {
                        setMergeSourceIds((prev) =>
                          event.target.checked
                            ? [...prev, candidate.activeSession.id]
                            : prev.filter((id) => id !== candidate.activeSession.id),
                        );
                      }}
                    />
                  </label>
                ))
              )}
            </div>
            <Button
              className="w-full"
              disabled={isPending || mergeSourceIds.length === 0}
              onClick={submitMerge}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gộp vào {tableLabel}
            </Button>
          </div>
        )}

        {mode === "split" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Chọn món/số lượng cần tách từ {tableLabel} sang bàn khác.
            </p>
            <TableSelect
              value={targetTableId}
              onValueChange={setTargetTableId}
              placeholder="Chọn bàn nhận món"
              tables={splitTargets}
            />
            <div className="space-y-2 max-h-72 overflow-y-auto rounded-lg border p-2">
              {activeSession.isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Đang tải món...
                </p>
              ) : splitItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Không có món có thể tách
                </p>
              ) : (
                splitItems.map((item: any) => {
                  const selectedQuantity = splitQuantities[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_88px] gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.quantity}x {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.orderNumber} · {formatCurrency(item.total ?? 0)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={selectedQuantity}
                        onChange={(event) => {
                          const next = Math.max(
                            0,
                            Math.min(item.quantity, Number(event.target.value) || 0),
                          );
                          setSplitQuantities((prev) => ({
                            ...prev,
                            [item.id]: next,
                          }));
                        }}
                        className="h-9 text-center"
                      />
                    </div>
                  );
                })
              )}
            </div>
            <Button
              className="w-full"
              disabled={isPending || selectedSplitItems.length === 0 || !targetTableId}
              onClick={submitSplit}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tách món
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
        active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TableSelect({
  value,
  onValueChange,
  placeholder,
  tables,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  tables: any[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {tables.map((candidate) => (
          <SelectItem key={candidate.id} value={candidate.id}>
            Bàn {candidate.number}
            {candidate.activeSession
              ? ` · đang có khách · ${formatCurrency(candidate.activeSession.total ?? 0)}`
              : " · trống"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
