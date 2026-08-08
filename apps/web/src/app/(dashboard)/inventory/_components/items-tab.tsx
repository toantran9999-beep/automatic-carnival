"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import {
  Plus,
  AlertTriangle,
  Printer,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn, formatCurrency, formatQty } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";
import { usePrintInventoryLabels } from "@/components/print-ticket";
import { useDeleteInventoryItem } from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";
import { toast } from "sonner";

const ALL = "__all__";

/**
 * Tab Nguyên liệu.
 *
 * Bản trước sổ thẳng 47 dòng trong một bảng 7 cột — trên điện thoại phải trượt ngang,
 * và không có cách nào nhìn ra "nhóm nào đang sắp hết". Nay gom nhóm theo danh mục,
 * xếp gọn được, kèm ô tìm + lọc nhóm + lọc "chỉ sắp hết".
 */
export function ItemsTab({
  items,
  isLoading,
  search,
  setSearch,
  lowOnly,
  setLowOnly,
  onNewItem,
  onEditItem,
}: {
  items: any[];
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  lowOnly: boolean;
  setLowOnly: (v: boolean) => void;
  onNewItem: () => void;
  onEditItem: (item: any) => void;
}) {
  const { t } = useTranslation();
  const printLabels = usePrintInventoryLabels();
  const deleteItem = useDeleteInventoryItem();

  const [category, setCategory] = useState<string>(ALL);
  /** Nhóm người dùng tự bấm mở/đóng. Chưa đụng tới thì theo mặc định thông minh. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const isLow = (item: any) =>
    parseFloat(item.current_stock ?? "0") < parseFloat(item.min_stock ?? "0");

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) if (item.category_name) names.add(item.category_name);
    return [...names].sort((a, b) => a.localeCompare(b, "vi"));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item: any) => {
      if (q && !`${item.name} ${item.internal_code ?? ""} ${item.barcode ?? ""}`.toLowerCase().includes(q))
        return false;
      if (category !== ALL && (item.category_name ?? "") !== category) return false;
      if (lowOnly && !isLow(item)) return false;
      return true;
    });
  }, [items, search, category, lowOnly]);

  /** Gom theo nhóm; thứ chưa gán nhóm dồn xuống cuối. */
  const groups = useMemo(() => {
    const byName = new Map<string, any[]>();
    for (const item of filtered) {
      const key = item.category_name ?? "";
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(item);
    }
    return [...byName.entries()]
      .sort(([a], [b]) => {
        if (a === "") return 1;
        if (b === "") return -1;
        return a.localeCompare(b, "vi");
      })
      .map(([name, rows]) => ({
        name,
        rows,
        lowCount: rows.filter(isLow).length,
      }));
  }, [filtered]);

  /**
   * Đang tìm kiếm hay đang lọc thì mở hết — người dùng vừa thu hẹp kết quả, bắt bấm
   * mở từng nhóm nữa là vô nghĩa. Bình thường chỉ mở nhóm có hàng sắp hết, để mở máy
   * lên là thấy ngay thứ cần mua.
   */
  const narrowing = !!search.trim() || category !== ALL || lowOnly;
  const isOpen = (g: { name: string; lowCount: number }) =>
    toggled[g.name] ?? (narrowing || g.lowCount > 0);

  async function remove(item: any) {
    if (!window.confirm(`${t("common.delete")}: ${item.name}?`)) return;
    try {
      const res = await deleteItem.mutateAsync(item.id);
      // Máy chủ ẩn thay vì xoá khi nguyên liệu đã có lịch sử — nói đúng chuyện đã
      // xảy ra, đừng báo "đã xóa" cho một thứ vẫn còn trong DB.
      toast.success(res?.message ?? t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  /** In nhãn cho đúng những gì đang lọc — quán chỉ dán lại vài hũ chứ hiếm khi cả kho. */
  function printFiltered() {
    printLabels(
      filtered
        .filter((item: any) => item.internal_code)
        .map((item: any) => ({
          code: item.internal_code,
          name: item.name,
          unit: item.unit,
          packLabel: item.pack_label,
        })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("inventory.searchPlaceholder")}
          className="min-w-[12rem] flex-1"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("inventory.allCategories")}</SelectItem>
            {categories.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={lowOnly ? "default" : "outline"}
          onClick={() => setLowOnly(!lowOnly)}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          {t("inventory.lowOnly")}
        </Button>
        <Button variant="outline" onClick={printFiltered} disabled={filtered.length === 0}>
          <Printer className="mr-2 h-4 w-4" />
          {t("inventory.printLabel")}
        </Button>
        <Button onClick={onNewItem}>
          <Plus className="mr-2 h-4 w-4" />
          {t("inventory.addIngredient")}
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {narrowing ? t("inventory.noMatch") : t("inventory.noItems")}
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const open = isOpen(group);
          return (
            <Card key={group.name || "__none__"}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() =>
                    setToggled((prev) => ({ ...prev, [group.name]: !open }))
                  }
                  className="flex min-h-[44px] w-full items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {group.name || t("inventory.noCategory")}{" "}
                    <span className="text-muted-foreground">({group.rows.length})</span>
                  </span>
                  {group.lowCount > 0 && (
                    <span className="shrink-0 text-xs font-medium text-destructive">
                      {group.lowCount} {t("inventory.lowSuffix")}
                    </span>
                  )}
                </button>

                {open && (
                  <ul>
                    {group.rows.map((item: any) => {
                      const low = isLow(item);
                      return (
                        <li
                          key={item.id}
                          className={cn(
                            "flex items-center gap-3 border-b border-border px-3 py-2 last:border-0",
                            low && "bg-destructive/5",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {low && (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                              )}
                              <span className="truncate text-sm font-medium text-foreground">
                                {item.name}
                              </span>
                            </div>
                            {/* Mã để đối chiếu với nhãn đã dán trên hũ. */}
                            {(item.barcode || item.internal_code) && (
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {item.barcode || item.internal_code}
                              </p>
                            )}
                          </div>

                          {/* Giá vốn chỉ hiện trên màn rộng — máy quầy không cần. */}
                          <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                            {formatCurrency(item.cost_per_unit ?? 0)}/{item.unit}
                          </span>

                          <div className="shrink-0 text-right">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                low ? "text-destructive" : "text-foreground",
                              )}
                            >
                              {formatQty(item.current_stock)}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {item.unit}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {t("inventory.minShort")} {formatQty(item.min_stock)}
                            </p>
                          </div>

                          {/* h-11 w-11: máy quầy bấm bằng ngón tay, vùng bấm ≥44px. */}
                          <div className="flex shrink-0 gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
                              onClick={() => onEditItem(item)}
                              aria-label={t("common.edit")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-destructive"
                              onClick={() => remove(item)}
                              disabled={deleteItem.isPending}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
