"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { toast } from "sonner";
import { StockCart, type CartLine } from "./stock-cart";
import { useCreateReceipt } from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";

/** Nhập hàng: quét liên tiếp nhiều loại rồi lưu một phiếu. */
export function ReceiveTab({ items }: { items: any[] }) {
  const { t } = useTranslation();
  const createReceipt = useCreateReceipt();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [reference, setReference] = useState("");

  async function save() {
    const valid = lines.filter((l) => (parseFloat(l.quantity) || 0) > 0);
    if (valid.length === 0) return;

    try {
      await createReceipt.mutateAsync({
        lines: valid.map((l) => ({
          itemId: l.itemId,
          quantity: parseFloat(l.quantity),
          // ⚠️ Giá vốn lưu theo XU trong DB — người dùng gõ đồng, nhân 100 ở đây.
          unitCost: l.unitCost ? Math.round(parseFloat(l.unitCost) * 100) : null,
        })),
        reference: reference || undefined,
      });
      setLines([]);
      setReference("");
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  return (
    <StockCart items={items} lines={lines} setLines={setLines} showCost>
      <div className="space-y-2">
        <Label htmlFor="receiptRef">{t("inventory.movementReason")}</Label>
        <Input
          id="receiptRef"
          placeholder={t("inventory.movementReasonPlaceholder")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <Button
        className="w-full"
        onClick={save}
        disabled={lines.length === 0 || createReceipt.isPending}
      >
        {createReceipt.isPending ? t("common.saving") : t("inventory.saveReceipt")}
      </Button>
    </StockCart>
  );
}
