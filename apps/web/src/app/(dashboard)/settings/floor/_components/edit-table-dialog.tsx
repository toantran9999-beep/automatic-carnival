"use client";

import { useEffect, useState } from "react";
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
  DialogDescription,
} from "@restai/ui/components/dialog";
import { toast } from "sonner";
import { useUpdateTable } from "@/hooks/use-tables";
import { useTranslation } from "@/stores/lang-store";

const NO_ZONE = "none";

/**
 * Sửa bàn: đổi sức chứa, chuyển sang khu khác.
 *
 * ⚠️ KHÔNG đổi được SỐ BÀN — chủ quán đã chốt. Máy chủ (`PATCH /tables/:id`)
 * hiện chỉ nhận `capacity` + `spaceId`; và đổi số của bàn đang có khách thì phiếu
 * đã in ra không còn khớp với bàn nữa.
 */
export function EditTableDialog({
  table,
  spaces,
  onClose,
}: {
  table: any | null;
  spaces: any[];
  onClose: () => void;
}) {
  const { t, lang } = useTranslation();
  const updateTable = useUpdateTable();
  const [capacity, setCapacity] = useState("4");
  const [spaceId, setSpaceId] = useState<string>(NO_ZONE);

  useEffect(() => {
    if (!table) return;
    setCapacity(String(table.capacity ?? 4));
    setSpaceId(table.space_id ?? NO_ZONE);
  }, [table]);

  const handleSave = async () => {
    if (!table) return;
    const cap = parseInt(capacity, 10);
    if (!cap || cap < 1 || cap > 50) {
      toast.error(lang === "vi" ? "Sức chứa phải từ 1 đến 50." : "Capacity must be 1–50.");
      return;
    }
    try {
      await updateTable.mutateAsync({
        id: table.id,
        capacity: cap,
        // null = bỏ khỏi mọi khu. Phải gửi null chứ không phải bỏ trống, kẻo máy
        // chủ hiểu là "không đổi" và bàn ở lại khu cũ.
        spaceId: spaceId === NO_ZONE ? null : spaceId,
      });
      toast.success(lang === "vi" ? "Đã lưu" : "Saved");
      onClose();
    } catch (err: any) {
      toast.error(err.message || t("common.error"));
    }
  };

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {lang === "vi" ? `Sửa bàn ${table?.number ?? ""}` : `Edit table ${table?.number ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {lang === "vi"
              ? "Số bàn không đổi được — phiếu đã in sẽ không còn khớp."
              : "The table number cannot be changed — printed tickets would no longer match."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-capacity">{t("tables.tableCapacity")}</Label>
            <Input
              id="edit-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tables.spaces")}</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("tables.unassigned")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ZONE}>{t("tables.unassigned")}</SelectItem>
                {spaces.map((space: any) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Nút xếp DỌC: `DialogFooter` xếp ngang bằng `sm:` mà `sm:` đo MÀN HÌNH
            chứ không đo bề rộng hộp thoại — máy POS màn rộng là nút tràn ra ngoài. */}
        <div className="mt-2 flex flex-col gap-2">
          <Button className="h-12 w-full" onClick={handleSave} disabled={updateTable.isPending}>
            {updateTable.isPending ? t("settings.saving") : t("settings.saveChanges")}
          </Button>
          <Button variant="ghost" className="h-11 w-full" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
