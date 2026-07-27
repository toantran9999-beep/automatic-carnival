"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@restai/ui/components/tabs";
import { Plus, LayoutGrid, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useSpaces,
  useTablesLayout,
  useDeleteSpace,
  useDeleteTable,
} from "@/hooks/use-tables";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/stores/lang-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloorPlannerView } from "../../tables/_components/floor-planner-view";
import { CreateTableDialog } from "../../tables/_components/create-table-dialog";
import {
  CreateSpaceDialog,
  EditSpaceDialog,
  SpaceInfoCard,
} from "../../tables/_components/space-management";
import { TableEditCard } from "./_components/table-edit-card";
import { EditTableDialog } from "./_components/edit-table-dialog";

/**
 * "Sơ đồ bàn" — màn SẮP XẾP CHỖ của quản lý.
 *
 * Chủ quán chốt ranh giới:
 *   /tables         = màn làm việc THẬT của thu ngân/phục vụ, CÓ dữ liệu khách.
 *   /settings/floor = CÙNG BỐ CỤC đó (dãy tab khu + lưới thẻ bàn) nhưng KHÔNG có
 *                     dữ liệu khách, chỉ thêm/bớt/sửa bàn và khu.
 *
 * ⚠️ Dùng `useTablesLayout()` chứ KHÔNG dùng `useTables()`. Máy chủ trả về đúng
 * 6 trường (id, số bàn, sức chứa, khu, vị trí) — **không có cả cột `status`**,
 * nên màn này không biết bàn nào đang có khách. Đó là cố ý: lọc ở giao diện là
 * vô nghĩa vì dữ liệu vẫn nằm trong bộ nhớ trình duyệt.
 *
 * ⚠️ Hệ quả: màn này KHÔNG THỂ tự tránh xoá nhầm bàn đang có khách. Việc chặn
 * nằm ở máy chủ (`DELETE /tables/:id` trả 409 `TABLE_IN_USE`).
 */

const ALL_TAB = "all";
const UNASSIGNED_TAB = "unassigned";

export default function FloorSettingsPage() {
  const { t, lang } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data: spacesData, isLoading: spacesLoading } = useSpaces();
  const { data: tablesData, isLoading: tablesLoading } = useTablesLayout();
  const deleteSpace = useDeleteSpace();
  const deleteTable = useDeleteTable();

  const [viewMode, setViewMode] = useState<"grid" | "planner">("grid");
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [editSpace, setEditSpace] = useState<any>(null);
  const [editTable, setEditTable] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { type: "table" | "space"; id: string; name: string } | null
  >(null);

  const zoneScrollRef = useRef<HTMLDivElement | null>(null);

  const spaces: any[] = spacesData ?? [];
  const allTables: any[] = (tablesData as any)?.tables ?? [];
  const isLoading = spacesLoading || tablesLoading;

  // Chỉ quản lý trở lên mới sắp xếp được. Thu ngân/phục vụ vào đây đã bị lớp
  // chặn đường dẫn theo vai trò đá về trang Bàn ăn — đây là lớp thứ hai.
  const canManage = !!user && ["super_admin", "org_admin", "branch_manager"].includes(user.role);

  const zoneNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of spaces) map[s.id] = s.name;
    return map;
  }, [spaces]);

  /**
   * ⚠️ Nhãn tab chỉ ghi TỔNG SỐ BÀN, không ghi "trống/tổng" như bên Bàn ăn —
   * "trống" là dữ liệu đang bán hàng, màn này không có và không được có.
   *
   * ⚠️ "Chưa phân khu" LUÔN hiện kể cả khi rỗng: chủ quán coi đây là một khu
   * thật (khu hỗn hợp), không phải chỗ chứa tạm. Đừng ẩn đi cho "gọn".
   */
  const zoneOptions = useMemo(
    () => [
      ...spaces.map((space: any) => ({
        id: space.id,
        name: space.name,
        total: allTables.filter((tb: any) => tb.space_id === space.id).length,
      })),
      {
        id: UNASSIGNED_TAB,
        name: t("tables.unassigned"),
        total: allTables.filter((tb: any) => !tb.space_id).length,
      },
    ],
    [spaces, allTables, t],
  );

  const filteredTables = useMemo(() => {
    if (activeTab === ALL_TAB) return allTables;
    if (activeTab === UNASSIGNED_TAB) return allTables.filter((tb: any) => !tb.space_id);
    return allTables.filter((tb: any) => tb.space_id === activeTab);
  }, [allTables, activeTab]);

  const tablesWithZone = useMemo(
    () => allTables.map((tb) => ({ ...tb, space_name: zoneNameById[tb.space_id] ?? "" })),
    [allTables, zoneNameById],
  );

  const zoneOrder = useMemo(() => spaces.map((s) => s.name as string), [spaces]);

  // Kéo tab đang chọn vào giữa tầm nhìn.
  // ⚠️ Đặt thẳng `scrollLeft`, TUYỆT ĐỐI không dùng `scrollIntoView`: nó cuộn
  // MỌI khung cha, mà `<main>` của bảng điều khiển là khung cuộn ngang → sẽ đẩy
  // lệch ngang cả trang, tiêu đề và logo bị cắt cụt. Đã mắc đúng lỗi này.
  useEffect(() => {
    const box = zoneScrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-zone-tab="${activeTab}"]`);
    if (!box || !el) return;
    box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [activeTab]);

  const currentSpace =
    activeTab !== ALL_TAB && activeTab !== UNASSIGNED_TAB
      ? spaces.find((s: any) => s.id === activeTab)
      : null;

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === "table") {
        await deleteTable.mutateAsync(confirmDelete.id);
      } else {
        await deleteSpace.mutateAsync(confirmDelete.id);
        if (activeTab === confirmDelete.id) setActiveTab(ALL_TAB);
      }
      toast.success(lang === "vi" ? "Đã xoá" : "Deleted");
      setConfirmDelete(null);
    } catch (err: any) {
      // Máy chủ trả 409 TABLE_IN_USE khi bàn đang có khách — hiện nguyên lời
      // nhắn của nó vì trong đó đã nói rõ phải làm gì.
      toast.error(err.message || t("common.error"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hàng nút: Lưới/Sơ đồ + Thêm khu + Thêm bàn — cùng khuôn với Bàn ăn. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lang === "vi"
            ? `${allTables.length} bàn · ${spaces.length} khu`
            : `${allTables.length} tables · ${spaces.length} zones`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="h-10 rounded-r-none"
              aria-label={lang === "vi" ? "Dạng lưới" : "Grid"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "planner" ? "default" : "ghost"}
              size="sm"
              className="h-10 rounded-l-none"
              aria-label={t("settings.tabFloor", "Sơ đồ bàn")}
              onClick={() => setViewMode("planner")}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
          </div>
          {canManage && (
            <>
              <Button variant="outline" className="h-10" onClick={() => setCreateSpaceOpen(true)}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                {t("tables.addSpace")}
              </Button>
              <Button className="h-10" onClick={() => setCreateTableOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("tables.addTable")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Dãy tab khu — một dải liền mạch, trượt ngang, dùng trọn bề ngang.
          ⚠️ Không ghim (sticky) mục nào và không nhét nút vào hàng này: phần ghim
          chiếm chỗ vĩnh viễn của vùng trượt, điện thoại hẹp là không còn chỗ cho
          khu vực. Đã mắc lỗi này ở trang Bàn ăn, màn rộng không lộ ra.
          ⚠️ KHÔNG có tab "Mang về" — đó là việc bán hàng, không phải sắp xếp chỗ. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="relative">
          <div
            ref={zoneScrollRef}
            className="flex items-center overflow-x-auto pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <TabsList className="h-11 shrink-0">
              <TabsTrigger
                value={ALL_TAB}
                data-zone-tab={ALL_TAB}
                className="h-9 px-4 text-sm font-semibold"
              >
                {t("tables.all")}
              </TabsTrigger>
              {zoneOptions.map((zone) => (
                <TabsTrigger
                  key={zone.id}
                  value={zone.id}
                  data-zone-tab={zone.id}
                  className="h-9 gap-1.5 px-4 text-sm font-semibold"
                >
                  {zone.name}
                  <span className="text-xs font-medium tabular-nums opacity-70">{zone.total}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* Vệt mờ mép phải: báo còn khu phía sau mà không tốn thêm chỗ. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
        </div>
      </Tabs>

      {currentSpace && (
        <SpaceInfoCard
          space={currentSpace}
          tableCount={filteredTables.length}
          canManage={canManage}
          onEdit={() => setEditSpace(currentSpace)}
          onDelete={() =>
            setConfirmDelete({ type: "space", id: currentSpace.id, name: currentSpace.name })
          }
        />
      )}

      {viewMode === "planner" ? (
        <div className="mt-4">
          <FloorPlannerView tables={tablesWithZone} layoutOnly zoneOrder={zoneOrder} />
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {lang === "vi"
              ? 'Khu này chưa có bàn nào. Bấm "Thêm bàn" ở trên.'
              : 'No tables in this zone yet. Use "Add table" above.'}
          </p>
        </div>
      ) : (
        // auto-rows-fr: mọi hàng cao bằng nhau, cùng lưới với trang Bàn ăn.
        <div className="mt-4 grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredTables.map((table: any) => (
            <TableEditCard
              key={table.id}
              table={table}
              zoneName={zoneNameById[table.space_id]}
              onEdit={setEditTable}
              onDelete={(tb) =>
                setConfirmDelete({
                  type: "table",
                  id: tb.id,
                  name: `${t("tables.title")} ${tb.number}`,
                })
              }
            />
          ))}
        </div>
      )}

      <CreateTableDialog
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        spaces={spaces}
      />
      <CreateSpaceDialog open={createSpaceOpen} onOpenChange={setCreateSpaceOpen} />
      <EditSpaceDialog space={editSpace} onClose={() => setEditSpace(null)} />
      <EditTableDialog table={editTable} spaces={spaces} onClose={() => setEditTable(null)} />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={
          confirmDelete?.type === "space"
            ? t("tables.deleteSpace", "Xoá khu vực")
            : t("tables.confirmDelete")
        }
        description={
          // ⚠️ Máy chủ CHẶN xoá khu còn bàn (spaces.ts kiểm trước khi xoá). Nói
          // trước ở đây để đỡ bấm rồi mới ăn lỗi — muốn xoá khu thì phải chuyển
          // hết bàn sang khu khác (nút Sửa trên thẻ bàn) hoặc xoá bàn đi đã.
          confirmDelete?.type === "space"
            ? lang === "vi"
              ? `Xoá khu "${confirmDelete.name}"? Khu còn bàn thì không xoá được — chuyển hết bàn sang khu khác trước.`
              : `Delete zone "${confirmDelete.name}"? A zone that still has tables cannot be deleted — move them to another zone first.`
            : lang === "vi"
              ? `Xoá ${confirmDelete?.name ?? ""}? Bàn đang có khách sẽ không xoá được.`
              : `Delete ${confirmDelete?.name ?? ""}? A table in use cannot be deleted.`
        }
        onConfirm={handleConfirmDelete}
        loading={deleteTable.isPending || deleteSpace.isPending}
      />
    </div>
  );
}
