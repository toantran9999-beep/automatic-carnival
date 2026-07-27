"use client";

import { Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { useTranslation } from "@/stores/lang-store";

/**
 * Thẻ bàn ở màn SẮP XẾP (Cài đặt → Sơ đồ bàn).
 *
 * ⚠️ CỐ Ý không dùng `TableCard` của trang Bàn ăn: thẻ đó gắn chặt với trạng
 * thái bàn, tên khách, tiền, nút thanh toán, QR, chuông gọi phục vụ — toàn thứ
 * màn này không được có. Dùng chung rồi truyền cờ tắt bớt thì vẫn phải nạp dữ
 * liệu khách vào, đúng cái phải tránh.
 *
 * Nền TRUNG TÍNH, không tô màu theo trạng thái: ở đây bàn nào cũng như bàn nào.
 */
export function TableEditCard({
  table,
  zoneName,
  onEdit,
  onDelete,
}: {
  table: any;
  zoneName?: string;
  onEdit: (table: any) => void;
  onDelete: (table: any) => void;
}) {
  const { t, lang } = useTranslation();

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-3">
      <div className="flex min-h-16 flex-1 flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none tabular-nums text-foreground">
          {table.number}
        </span>
        <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{table.capacity}</span>
        </span>
      </div>

      {/* Tên khu luôn chiếm một dòng kể cả khi trống, để mọi thẻ cao bằng nhau
          trong lưới (grid dùng auto-rows-fr). */}
      <p className="mt-1 truncate text-center text-[11px] text-muted-foreground">
        {zoneName || t("tables.unassigned")}
      </p>

      <div className="mt-2 flex gap-1.5">
        {/* h-10: bấm bằng ngón tay trên máy quầy, đừng để nút bé. */}
        <Button
          variant="outline"
          className="h-10 flex-1 px-0"
          aria-label={`${lang === "vi" ? "Sửa bàn" : "Edit table"} ${table.number}`}
          onClick={() => onEdit(table)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="h-10 flex-1 px-0 text-muted-foreground hover:text-destructive"
          aria-label={`${lang === "vi" ? "Xoá bàn" : "Delete table"} ${table.number}`}
          onClick={() => onDelete(table)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
