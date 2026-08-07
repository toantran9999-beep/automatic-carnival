"use client";

import { useCallback, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { BarcodeScannerDialog } from "@/components/barcode-scanner";
import { useLookupByCode, useUpdateInventoryItem } from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";

export type CartLine = {
  itemId: string;
  name: string;
  unit: string;
  quantity: string;
  /** Chỉ phiếu nhập mới dùng — đơn giá theo ĐỒNG, đổi sang xu lúc gửi. */
  unitCost?: string;
};

/**
 * Khung giỏ dùng chung cho cả Nhập hàng lẫn Xuất kho: quét → tra mã → thêm dòng.
 *
 * Quét mã chưa gắn cho nguyên liệu nào thì mở luôn hộp thoại "Gắn mã" — bắt người
 * đứng quầy thoát ra vào trang khác để gắn rồi quay lại quét tiếp là chỗ mà quy
 * trình sẽ bị bỏ giữa chừng.
 */
export function StockCart({
  items,
  lines,
  setLines,
  showCost,
  children,
}: {
  items: any[];
  lines: CartLine[];
  setLines: (updater: (prev: CartLine[]) => CartLine[]) => void;
  showCost?: boolean;
  /** Phần riêng của từng tab (lý do xuất, nút lưu…). */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const lookup = useLookupByCode();
  const updateItem = useUpdateInventoryItem();

  const [scanOpen, setScanOpen] = useState(false);
  /** Mã vừa quét nhưng chưa gắn cho nguyên liệu nào. */
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");

  const addLine = useCallback(
    (item: any) => {
      setLines((prev) => {
        const at = prev.findIndex((l) => l.itemId === item.id);
        // Quét lại cùng một thứ = cộng thêm một quy cách nữa, không đẻ dòng trùng.
        if (at >= 0) {
          const next = [...prev];
          const pack = parseFloat(item.pack_size ?? "1") || 1;
          next[at] = {
            ...next[at],
            quantity: String((parseFloat(next[at].quantity) || 0) + pack),
          };
          return next;
        }
        return [
          ...prev,
          {
            itemId: item.id,
            name: item.name,
            unit: item.unit,
            quantity: String(parseFloat(item.pack_size ?? "1") || 1),
            unitCost: "",
          },
        ];
      });
    },
    [setLines],
  );

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const item = await lookup.mutateAsync(code);
        addLine(item);
        toast.success(item.name);
      } catch {
        setPendingCode(code);
        setScanOpen(false);
      }
    },
    [lookup, addLine],
  );

  async function assignCode() {
    if (!pendingCode || !assignTo) return;
    try {
      const updated = await updateItem.mutateAsync({ id: assignTo, barcode: pendingCode });
      addLine(updated);
      toast.success(t("inventory.saveSuccess"));
      setPendingCode(null);
      setAssignTo("");
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setScanOpen(true)}>
          <ScanLine className="mr-2 h-4 w-4" />
          {t("inventory.scanToAdd")}
        </Button>
        <Select value="" onValueChange={(id) => addLine(items.find((i: any) => i.id === id))}>
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue placeholder={t("inventory.items")} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item: any) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("inventory.emptyCart")}
            </p>
          ) : (
            <ul>
              {lines.map((line, index) => (
                <li
                  key={line.itemId}
                  className="flex items-center gap-2 border-b border-border p-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.unit}</p>
                  </div>
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === index ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                  />
                  {showCost && (
                    <Input
                      className="w-28 shrink-0"
                      type="number"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      placeholder={t("inventory.price")}
                      value={line.unitCost ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, unitCost: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {children}

      <BarcodeScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />

      <Dialog
        open={!!pendingCode}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCode(null);
            setAssignTo("");
          }
        }}
      >
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{t("inventory.assignCode")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("inventory.scanUnknownCode")}</p>
              <p className="mt-1 font-mono text-sm text-foreground">{pendingCode}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("inventory.assignCodeHelp")}</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger>
                  <SelectValue placeholder={t("inventory.items")} />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={assignCode} disabled={!assignTo || updateItem.isPending}>
                {updateItem.isPending ? t("common.saving") : t("common.save")}
              </Button>
              <Button variant="outline" onClick={() => setPendingCode(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
