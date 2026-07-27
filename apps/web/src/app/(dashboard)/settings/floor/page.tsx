"use client";

import { useMemo, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Plus, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSpaces, useTablesLayout, useDeleteSpace } from "@/hooks/use-tables";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/stores/lang-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingSection } from "@/components/settings/setting-row";
import { FloorPlannerView } from "../../tables/_components/floor-planner-view";
import { CreateTableDialog } from "../../tables/_components/create-table-dialog";
import {
  CreateSpaceDialog,
  EditSpaceDialog,
} from "../../tables/_components/space-management";

/**
 * "Sơ đồ bàn" — màn SẮP XẾP CHỖ của quản lý.
 *
 * Chủ quán chốt: *"cấu hình giao diện bàn ở back end chỉ nên là sơ đồ phân bổ,
 * không có dữ liệu bàn như ở front end"*. Nên trang này:
 *
 *   CÓ    — khu vực, bàn, sức chứa, kéo thả đổi vị trí, phóng to/thu nhỏ.
 *   KHÔNG — tên khách, số tiền, trạng thái trống/có khách, chuông gọi phục vụ,
 *           và mọi nút chạm dữ liệu đang bán (thanh toán, gộp/tách, huỷ bàn).
 *
 * ⚠️ Dùng `useTablesLayout()` chứ KHÔNG dùng `useTables()`: máy chủ không gửi
 * tên khách và số tiền cho đường này. Lọc ở giao diện là vô nghĩa — dữ liệu vẫn
 * nằm trong bộ nhớ trình duyệt và vẫn xem được bằng công cụ nhà phát triển.
 *
 * ⚠️ Trang này KHÔNG có bất kỳ đường nào chạm dữ liệu đang chảy, nên máy chủ
 * chặn quản lý bằng `blockLiveOps` không ảnh hưởng gì ở đây.
 */
export default function FloorSettingsPage() {
  const { t, lang } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data: spacesData, isLoading: spacesLoading } = useSpaces();
  const { data: tablesData, isLoading: tablesLoading } = useTablesLayout();
  const deleteSpace = useDeleteSpace();

  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [editSpace, setEditSpace] = useState<any>(null);
  const [confirmDeleteSpace, setConfirmDeleteSpace] = useState<any>(null);

  const spaces: any[] = spacesData ?? [];
  const tables: any[] = (tablesData as any)?.tables ?? [];

  // Chỉ quản lý trở lên mới sắp xếp được. Thu ngân/phục vụ vào đây đã bị lớp
  // chặn đường dẫn theo vai trò đá về trang Bàn ăn từ trước, đây là lớp thứ hai.
  const canManage = !!user && ["super_admin", "org_admin", "branch_manager"].includes(user.role);

  const zoneOrder = useMemo(
    () => spaces.map((s) => s.name as string),
    [spaces],
  );

  // Gắn tên khu vào từng bàn để sơ đồ tô màu theo khu.
  const tablesWithZone = useMemo(
    () =>
      tables.map((tb) => ({
        ...tb,
        space_name: spaces.find((s) => s.id === tb.space_id)?.name ?? "",
      })),
    [tables, spaces],
  );

  const tableCountBySpace = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tb of tables) {
      const key = tb.space_id ?? "__none__";
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [tables]);

  const unassignedCount = tableCountBySpace["__none__"] ?? 0;
  const isLoading = spacesLoading || tablesLoading;

  const handleDeleteSpace = async () => {
    if (!confirmDeleteSpace) return;
    try {
      await deleteSpace.mutateAsync(confirmDeleteSpace.id);
      toast.success(t("common.success", "Đã xoá"));
    } catch (err: any) {
      toast.error(err.message || t("common.error"));
    }
    setConfirmDeleteSpace(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingSection
        title={t("tables.spaces")}
        description={
          lang === "vi"
            ? "Chia quán thành các khu để dễ tìm bàn. Mỗi khu một màu trên sơ đồ bên dưới."
            : "Split the shop into zones. Each zone gets its own colour on the map below."
        }
      >
        <div className="divide-y divide-border">
          {spaces.map((space, i) => (
            <div key={space.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={`h-3 w-3 shrink-0 rounded-full border ${ZONE_DOT[i % ZONE_DOT.length]}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{space.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {space.floor_number ? `${t("tables.floor")} ${space.floor_number} · ` : ""}
                    {tableCountBySpace[space.id] ?? 0} {t("tables.tablesCount")}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 p-0"
                    aria-label={t("common.edit", "Sửa")}
                    onClick={() => setEditSpace(space)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={t("common.delete", "Xoá")}
                    onClick={() => setConfirmDeleteSpace(space)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {unassignedCount > 0 && (
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {lang === "vi"
                  ? `${unassignedCount} bàn chưa xếp vào khu nào`
                  : `${unassignedCount} tables not in any zone`}
              </p>
            </div>
          )}
          {spaces.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {lang === "vi"
                  ? "Chưa có khu nào. Tạo khu đầu tiên để chia sơ đồ cho dễ nhìn."
                  : "No zones yet. Create one to organise the map."}
              </p>
            </div>
          )}
        </div>
      </SettingSection>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setCreateSpaceOpen(true)}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            {t("tables.addSpace")}
          </Button>
          <Button className="h-11" onClick={() => setCreateTableOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("tables.addTable")}
          </Button>
        </div>
      )}

      <SettingSection
        title={t("settings.tabFloor", "Sơ đồ bàn")}
        description={
          lang === "vi"
            ? "Kéo thả bàn để xếp đúng vị trí thật trong quán. Màn này không hiện bàn nào đang có khách."
            : "Drag tables to match the real room. Live table status is not shown here."
        }
      >
        <div className="p-4">
          <FloorPlannerView
            tables={tablesWithZone}
            layoutOnly
            zoneOrder={zoneOrder}
          />
        </div>
      </SettingSection>

      <CreateTableDialog
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        spaces={spaces}
      />
      <CreateSpaceDialog open={createSpaceOpen} onOpenChange={setCreateSpaceOpen} />
      <EditSpaceDialog space={editSpace} onClose={() => setEditSpace(null)} />
      <ConfirmDialog
        open={!!confirmDeleteSpace}
        onOpenChange={(o) => !o && setConfirmDeleteSpace(null)}
        title={t("tables.deleteSpace", "Xoá khu vực")}
        description={
          lang === "vi"
            ? `Xoá "${confirmDeleteSpace?.name ?? ""}"? Bàn trong khu sẽ thành chưa phân khu, không bị xoá.`
            : `Delete "${confirmDeleteSpace?.name ?? ""}"? Its tables become unassigned, not deleted.`
        }
        onConfirm={handleDeleteSpace}
      />
    </div>
  );
}

/** Cùng thứ tự với ZONE_PALETTE trong floor-planner-view để chấm màu khớp sơ đồ. */
const ZONE_DOT = [
  "bg-sky-400 border-sky-500",
  "bg-amber-400 border-amber-500",
  "bg-violet-400 border-violet-500",
  "bg-emerald-400 border-emerald-500",
  "bg-rose-400 border-rose-500",
  "bg-teal-400 border-teal-500",
];
