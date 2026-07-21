"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Plus, Minus, PencilLine } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

/**
 * Dialog thêm "món khác" — khách gọi món ngoài menu nhưng quán vẫn phục vụ được.
 * Nhân viên tự nhập tên + giá (đơn vị ĐỒNG). Giá quy đổi sang cents ở component cha.
 */
export function CustomItemDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, priceVnd: number, qty: number, notes: string) => void;
}) {
  const { lang } = useTranslation();
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setPriceText("");
      setQuantity(1);
      setNotes("");
    }
  }, [open]);

  const vi = lang === "vi";
  // Chỉ giữ chữ số — người dùng gõ "25000" hoặc "25.000" đều được.
  const priceVnd = parseInt(priceText.replace(/\D/g, ""), 10) || 0;
  const lineTotal = priceVnd * 100 * quantity; // cents để dùng formatCurrency
  const canAdd = name.trim().length > 0 && priceVnd > 0;

  const handleConfirm = () => {
    if (!canAdd) return;
    onAdd(name, priceVnd, quantity, notes);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="h-5 w-5 text-primary" />
            {vi ? "Món nhập tay" : "Custom item"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <p className="mb-1.5 text-sm font-semibold">
              {vi ? "Tên món" : "Item name"}
            </p>
            <Input
              autoFocus
              placeholder={vi ? "VD: Trà tắc đặc biệt" : "e.g. Special drink"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 text-base md:text-sm"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">
              {vi ? "Giá (đồng)" : "Price (VND)"}
            </p>
            <Input
              inputMode="numeric"
              placeholder={vi ? "VD: 25000" : "e.g. 25000"}
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              className="h-11 text-base md:text-sm"
            />
            {priceVnd > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                = {formatCurrency(priceVnd * 100)}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">
              {vi ? "Ghi chú" : "Notes"}
            </p>
            <Input
              placeholder={vi ? "Tùy chọn" : "Optional"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 text-base md:text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {vi ? "Số lượng" : "Quantity"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-lg"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="h-4.5 w-4.5" />
              </Button>
              <span className="w-9 text-center text-lg font-bold">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-lg"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="h-4.5 w-4.5" />
              </Button>
            </div>
          </div>
          <Button
            className="h-12 w-full text-base font-semibold"
            disabled={!canAdd}
            onClick={handleConfirm}
          >
            <Plus className="mr-2 h-4 w-4" />
            {vi ? "Thêm vào giỏ" : "Add to cart"}
            {lineTotal > 0 && <> · {formatCurrency(lineTotal)}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
