"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { PasswordInput } from "@restai/ui/components/password-input";
import { Label } from "@restai/ui/components/label";
import { useVoidOrder } from "@/hooks/use-orders";
import { useAuthStore } from "@/stores/auth-store";
import { isManagerRole } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";

const QUICK_REASONS = ["Khách đổi món", "Bấm nhầm món", "Khách không lấy nữa"];

/**
 * Nút "Hủy đơn để nhập lại" ở cuối hộp thoại chi tiết đơn.
 *
 * ⚠️ Mở ra TẠI CHỖ (không bật thêm hộp thoại chồng lên hộp thoại) — Dialog lồng
 * Dialog đã từng vỡ ở `history-dialog.tsx`.
 *
 * ⚠️ Ẩn với quản lý: `blockLiveOps` chặn họ ở máy chủ, bày nút ra là bấm ăn 403.
 * Hủy đơn làm ở tài khoản chi nhánh tại quầy, như mọi thao tác bán hàng.
 *
 * Mã là mã khoá tab Đơn hàng, và phải gõ LẠI dù vừa gõ để vào tab — vé vào tab
 * chỉ cho xem, còn hủy là rút tiền khỏi sổ.
 */
export function VoidOrderSection({
  orderId,
  orderNumber,
  paidTotal,
  onDone,
}: {
  orderId: string;
  orderNumber: string;
  paidTotal: number;
  onDone: () => void;
}) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const voidOrder = useVoidOrder();

  if (!user || isManagerRole(user.role)) return null;

  const canSubmit = code.trim().length > 0 && reason.trim().length >= 2 && !voidOrder.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const res = await voidOrder.mutateAsync({ id: orderId, code: code.trim(), reason: reason.trim() });
      toast.success(
        res.refunded > 0
          ? `Đã hủy đơn #${res.orderNumber} — trả khách ${formatCurrency(res.refunded)}`
          : `Đã hủy đơn #${res.orderNumber}`,
      );
      setOpen(false);
      setCode("");
      setReason("");
      onDone();
    } catch (err: any) {
      // Gõ sai mã thì xoá ô mã cho gõ lại, giữ nguyên lý do.
      setCode("");
      toast.error(err?.message || "Không hủy được đơn");
    }
  };

  if (!open) {
    return (
      <div className="border-t pt-3">
        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Hủy đơn để nhập lại
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-destructive">Hủy đơn #{orderNumber}</p>
        <p className="text-xs leading-snug text-muted-foreground">
          Đơn chuyển sang <b>Đã hủy</b>, không tính vào doanh thu và tiền ca
          {paidTotal > 0 ? (
            <>
              {" "}— nhớ <b>trả lại khách {formatCurrency(paidTotal)}</b>
            </>
          ) : null}
          . Nguyên liệu đã trừ được cộng lại kho. Xong thì nhập đơn mới như bình thường.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Lý do</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={reason === r ? "default" : "outline"}
              onClick={() => setReason(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hoặc gõ lý do khác" maxLength={200} />
      </div>

      <div className="space-y-1.5">
        <Label>Mã của chủ quán</Label>
        <PasswordInput
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Mã mở khoá tab Đơn hàng"
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={voidOrder.isPending}
          onClick={() => {
            setOpen(false);
            setCode("");
          }}
        >
          Thôi
        </Button>
        <Button type="submit" variant="destructive" className="flex-1" disabled={!canSubmit}>
          {voidOrder.isPending ? "Đang hủy…" : "Hủy đơn"}
        </Button>
      </div>
    </form>
  );
}
