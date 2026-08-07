"use client";

import { useState } from "react";
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
import { toast } from "sonner";
import { StockCart, type CartLine } from "./stock-cart";
import { useCreateIssue } from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";

type IssueType = "issue" | "waste" | "adjustment";

/**
 * Xuất kho: xuất dùng / đổ bỏ / kiểm kê điều chỉnh.
 *
 * Ba lý do là ba loại phiếu khác nhau chứ không phải một ô ghi chú: gộp chung thì
 * báo cáo hao hụt phồng lên vì mấy lần xuất dùng bình thường, và không ai biết
 * quán thật sự hư hỏng bao nhiêu.
 */
export function IssueTab({ items }: { items: any[] }) {
  const { t } = useTranslation();
  const createIssue = useCreateIssue();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [type, setType] = useState<IssueType>("issue");
  const [reason, setReason] = useState("");

  async function save() {
    const valid = lines.filter((l) => (parseFloat(l.quantity) || 0) !== 0);
    if (valid.length === 0 || !reason.trim()) return;

    try {
      await createIssue.mutateAsync({
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: parseFloat(l.quantity) })),
        type,
        reason: reason.trim(),
      });
      setLines([]);
      setReason("");
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  return (
    <StockCart items={items} lines={lines} setLines={setLines}>
      <div className="space-y-2">
        <Label>{t("inventory.movementType")}</Label>
        <Select value={type} onValueChange={(v) => setType(v as IssueType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="issue">{t("inventory.issueReasonUse")}</SelectItem>
            <SelectItem value="waste">{t("inventory.issueReasonWaste")}</SelectItem>
            <SelectItem value="adjustment">{t("inventory.issueReasonCount")}</SelectItem>
          </SelectContent>
        </Select>
        {/* Chỉ phiếu kiểm kê mới được ghi số âm — máy chủ cũng chặn lại lần nữa. */}
        {type === "adjustment" && (
          <p className="text-xs text-muted-foreground">{t("inventory.countHint")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="issueReason">{t("inventory.issueReasonRequired")} *</Label>
        <Input
          id="issueReason"
          placeholder={t("inventory.movementReasonPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </div>

      <Button
        className="w-full"
        onClick={save}
        disabled={lines.length === 0 || !reason.trim() || createIssue.isPending}
      >
        {createIssue.isPending ? t("common.saving") : t("inventory.saveIssue")}
      </Button>
    </StockCart>
  );
}
