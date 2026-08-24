"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import {
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UtensilsCrossed,
  ArrowUpDown,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Check,
  ImagePlus,
  EyeOff,
} from "lucide-react";
import { formatCurrency, sortByOrder, cn } from "@/lib/utils";
import { toThumbUrl } from "@/lib/image-thumb";
import {
  useUpdateMenuItem,
  useDeleteMenuItem,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/use-menu";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { useTranslation } from "@/stores/lang-store";
import { CategoryDialog } from "./category-dialog";
import { ProductDialog } from "./product-dialog";
import { ImageUploadButton } from "./image-upload-button";
import { ActionsMenu, type ActionItem } from "@/components/actions-menu";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

/** Nhóm ảo gom các món đã ẩn — không phải danh mục thật trong DB. */
const HIDDEN_ID = "__hidden__";

export function ProductsPanel({
  categories,
  menuItems,
  allModifierGroups,
  isLoading,
}: {
  categories: any[];
  menuItems: any[];
  allModifierGroups: any[];
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();
  const deleteCat = useDeleteCategory();
  const updateCat = useUpdateCategory();
  const { t } = useTranslation();

  // Chế độ sắp xếp món: chỉ bật khi đang xem 1 danh mục cụ thể (thứ tự lưu theo danh mục).
  const [reorderMode, setReorderMode] = useState(false);
  // Thứ tự tạm phía client để lưới đổi NGAY khi bấm/thả, không chờ API (mutation
  // invalidate cả cây ["menu"] nên nếu chờ thì giao diện sẽ nháy).
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "category" | "product";
    id: string;
    name: string;
  } | null>(null);

  const categoryList: any[] = sortByOrder(categories ?? []);
  const allItems: any[] = menuItems ?? [];

  const isHiddenItem = (item: any) => !(item.isAvailable ?? item.is_available ?? true);

  // Map items to categories for counts — KHÔNG tính món đã ẩn để số đếm khớp với
  // những gì thực sự hiện ra (món ẩn đã tách sang nhóm riêng "Món đã ẩn").
  const itemCountByCategory: Record<string, number> = {};
  for (const item of allItems) {
    if (isHiddenItem(item)) continue;
    const catId = item.categoryId || item.category_id;
    itemCountByCategory[catId] = (itemCountByCategory[catId] || 0) + 1;
  }
  const hiddenItems = allItems.filter(isHiddenItem);
  const visibleCount = allItems.length - hiddenItems.length;

  // Filter items by selected category and search
  const filteredItems = allItems.filter((item: any) => {
    const catId = item.categoryId || item.category_id;
    const hidden = isHiddenItem(item);
    if (search) {
      // Đang tìm kiếm thì quét cả món đã ẩn để bật lại cho nhanh
      const q = search.toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !(item.description || "").toLowerCase().includes(q)
      )
        return false;
      if (selectedCategoryId === HIDDEN_ID) return hidden;
      return selectedCategoryId === "all" || catId === selectedCategoryId;
    }
    // Món đã ẩn được cất riêng, không lẫn vào "Tất cả" lẫn danh mục gốc
    if (selectedCategoryId === HIDDEN_ID) return hidden;
    if (hidden) return false;
    if (selectedCategoryId !== "all" && catId !== selectedCategoryId) return false;
    return true;
  });

  // Thứ tự hiển thị: ưu tiên thứ tự tạm (đang kéo/bấm), sau đó tới sort_order từ API.
  const sortedItems = sortByOrder(filteredItems);
  const visibleItems = pendingOrder
    ? [...sortedItems].sort(
        (a, b) => pendingOrder.indexOf(a.id) - pendingOrder.indexOf(b.id),
      )
    : sortedItems;

  // Chỉ sắp xếp được khi đang xem đúng 1 danh mục THẬT và không tìm kiếm.
  // Nhóm "Đã ẩn" gom món từ nhiều danh mục nên sắp xếp ở đó sẽ ghi sort_order lẫn lộn.
  const canReorder =
    selectedCategoryId !== "all" && selectedCategoryId !== HIDDEN_ID && !search;
  // Tự thoát chế độ sắp xếp nếu người dùng chuyển sang "Tất cả" hoặc bắt đầu tìm kiếm
  const isReordering = reorderMode && canReorder;

  /**
   * Vào chế độ sắp xếp. Thứ tự lưu theo TỪNG danh mục nên nếu đang ở "Tất cả"
   * (hoặc đang tìm kiếm) thì tự chuyển về đúng danh mục rồi sắp luôn —
   * không bắt người dùng phải tự mò chọn danh mục trước.
   */
  const enterReorder = (categoryId?: string) => {
    const target =
      categoryId ||
      (selectedCategoryId !== "all" && selectedCategoryId !== HIDDEN_ID
        ? selectedCategoryId
        : categoryList[0]?.id);
    if (!target || target === HIDDEN_ID) return;
    if (search) setSearch("");
    if (target !== selectedCategoryId) setSelectedCategoryId(target);
    setPendingOrder(null);
    setReorderMode(true);
  };

  const exitReorder = () => {
    setReorderMode(false);
    setPendingOrder(null);
  };

  /** Đổi danh mục đang xem — phải xóa thứ tự tạm của danh mục cũ kẻo hiển thị sai. */
  const handleSelectCategory = (id: string) => {
    if (id === selectedCategoryId) return;
    setPendingOrder(null);
    setSelectedCategoryId(id);
  };

  /** Gán lại số thứ tự cho cả danh sách, chỉ gọi API cho món bị lệch. */
  const saveOrder = (list: any[]) =>
    Promise.all(
      list.map((it, order) =>
        Number(it.sortOrder ?? it.sort_order ?? 0) === order
          ? Promise.resolve()
          : updateItem.mutateAsync({ id: it.id, sortOrder: order }),
      ),
    );

  /** Lưu thứ tự cho danh mục ĐANG XEM (giữ thứ tự tạm để lưới đổi ngay, không nháy). */
  const persistOrder = async (next: any[]) => {
    const prevOrder = pendingOrder;
    setPendingOrder(next.map((it) => it.id));
    setSavingOrder(true);
    try {
      await saveOrder(next);
    } catch (err: any) {
      setPendingOrder(prevOrder);
      toast.error(err?.message || t("menu.saveError"));
    } finally {
      setSavingOrder(false);
    }
  };

  /**
   * Đưa 1 món lên đầu / xuống cuối danh mục của nó — bấm 1 phát, không cần vào
   * chế độ sắp xếp. Chạy được cả khi đang xem "Tất cả" (tự tính trong đúng danh mục).
   */
  const moveItemToEdge = async (item: any, edge: "top" | "bottom") => {
    const catId = item.categoryId || item.category_id;
    const list = sortByOrder(
      allItems.filter((i: any) => (i.categoryId || i.category_id) === catId),
    );
    const idx = list.findIndex((i: any) => i.id === item.id);
    if (idx < 0) return;
    const next = [...list];
    const [moved] = next.splice(idx, 1);
    if (edge === "top") next.unshift(moved);
    else next.push(moved);

    // Đang xem đúng danh mục đó → dùng thứ tự tạm cho mượt; ngược lại lưu thẳng.
    if (selectedCategoryId === catId && !search) {
      await persistOrder(next);
      toast.success(t("menu.orderSaved"));
      return;
    }
    setSavingOrder(true);
    try {
      await saveOrder(next);
      toast.success(t("menu.orderSaved"));
    } catch (err: any) {
      toast.error(err?.message || t("menu.saveError"));
    } finally {
      setSavingOrder(false);
    }
  };

  const handleMoveItem = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= visibleItems.length) return;
    const next = [...visibleItems];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    persistOrder(next);
  };

  const handleDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = visibleItems.findIndex((i: any) => i.id === dragId);
    const to = visibleItems.findIndex((i: any) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...visibleItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  };

  /** Đổi thứ tự danh mục — quyết định thứ tự các nhóm hiện trên màn Bán hàng. */
  const handleMoveCategory = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= categoryList.length) return;
    const next = [...categoryList];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    try {
      await Promise.all(
        next.map((cat, order) =>
          Number(cat.sortOrder ?? cat.sort_order ?? 0) === order
            ? Promise.resolve()
            : updateCat.mutateAsync({ id: cat.id, sortOrder: order }),
        ),
      );
    } catch (err: any) {
      toast.error(err?.message || t("menu.saveError"));
    }
  };

  /** Các mục trong menu ⋮ của một danh mục (dùng chung cho sidebar và chip mobile). */
  const categoryActions = (cat: any, idx: number): ActionItem[] => [
    {
      key: "edit",
      label: t("common.edit"),
      icon: Edit,
      onSelect: () => {
        setEditingCategory(cat);
        setCatDialogOpen(true);
      },
    },
    {
      key: "up",
      label: t("menu.moveUp"),
      icon: ChevronUp,
      disabled: idx === 0,
      onSelect: () => handleMoveCategory(idx, -1),
    },
    {
      key: "down",
      label: t("menu.moveDown"),
      icon: ChevronDown,
      disabled: idx === categoryList.length - 1,
      onSelect: () => handleMoveCategory(idx, 1),
    },
    {
      key: "delete",
      label: t("common.delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => setConfirmDelete({ type: "category", id: cat.id, name: cat.name }),
    },
  ];

  const activeCategoryName =
    selectedCategoryId === "all"
      ? t("common.all")
      : selectedCategoryId === HIDDEN_ID
        ? t("menu.hiddenItems")
        : categoryList.find((c: any) => c.id === selectedCategoryId)?.name ?? t("menu.products");

  const handleToggleAvailability = (item: any) => {
    updateItem.mutate(
      {
        id: item.id,
        isAvailable: !(item.isAvailable ?? item.is_available),
      },
      {
        onSuccess: () =>
          toast.success(
            `${item.name} ${!(item.isAvailable ?? item.is_available) ? t("menu.active") : t("menu.inactive")}`
          ),
      }
    );
  };

  const handleImageUploaded = (item: any, url: string) => {
    updateItem.mutate({ id: item.id, imageUrl: url });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === "category") {
        await deleteCat.mutateAsync(confirmDelete.id);
        toast.success(t("menu.deleteSuccess"));
        if (selectedCategoryId === confirmDelete.id) {
          setSelectedCategoryId("all");
        }
      } else {
        const result: any = await deleteItem.mutateAsync(confirmDelete.id);
        toast.success(result?.hidden ? result.message : t("menu.deleteSuccess"));
      }
    } catch (err: any) {
      toast.error(err.message || t("menu.deleteError"));
    }
    confirmDelete && setConfirmDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <div className="hidden md:block w-56 shrink-0 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-10" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (categoryList.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-lg">
        <UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-4">
          {t("menu.noItems")}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setEditingCategory(null);
            setCatDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("menu.addCategory")}
        </Button>
        {catDialogOpen && (
          <CategoryDialog
            open={catDialogOpen}
            onOpenChange={(v) => {
              setCatDialogOpen(v);
              if (!v) setEditingCategory(null);
            }}
            initial={editingCategory}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Left sidebar: categories (desktop) */}
      <div className="hidden md:block w-56 shrink-0">
        <div className="sticky top-4 space-y-1">
          {/* "Todos" option */}
          <button
            onClick={() => handleSelectCategory("all")}
            className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors text-left ${
              selectedCategoryId === "all"
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-muted text-foreground"
            }`}
          >
            <span className="truncate">{t("common.all")}</span>
            <span
              className={`text-xs tabular-nums ${
                selectedCategoryId === "all"
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground"
              }`}
            >
              {visibleCount}
            </span>
          </button>

          {/* Nhóm ảo: món đã ẩn (chỉ hiện khi thực sự có món bị ẩn) */}
          {hiddenItems.length > 0 && (
            <button
              onClick={() => handleSelectCategory(HIDDEN_ID)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                selectedCategoryId === HIDDEN_ID
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t("menu.hiddenItems")}</span>
              </span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  selectedCategoryId === HIDDEN_ID
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {hiddenItems.length}
              </span>
            </button>
          )}

          {/* Category list */}
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto space-y-1">
            {categoryList.map((cat: any, catIdx: number) => {
              const isActive = selectedCategoryId === cat.id;
              const count = itemCountByCategory[cat.id] || 0;
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "flex items-center gap-0.5 rounded-md pr-1 transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <button
                    onClick={() => handleSelectCategory(cat.id)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left text-sm",
                      isActive ? "font-medium" : "text-foreground",
                    )}
                  >
                    <span className="truncate pr-1">{cat.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        isActive ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                  {/* Menu thao tác luôn hiện (không phụ thuộc rê chuột) */}
                  <ActionsMenu
                    label={`${t("menu.actions")} — ${cat.name}`}
                    items={categoryActions(cat, catIdx)}
                    triggerClassName={cn(
                      "h-8 w-8 shrink-0",
                      isActive &&
                        "text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground",
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* Create category button */}
          <button
            onClick={() => {
              setEditingCategory(null);
              setCatDialogOpen(true);
            }}
            className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("menu.addCategory")}
          </button>
        </div>
      </div>

      {/* Main area: products */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Mobile category chips (horizontal scroll) */}
        <div className="md:hidden -mx-1 px-1 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => handleSelectCategory("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedCategoryId === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {t("common.all")} · {visibleCount}
          </button>
          {hiddenItems.length > 0 && (
            <button
              onClick={() => handleSelectCategory(HIDDEN_ID)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                selectedCategoryId === HIDDEN_ID
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {t("menu.hiddenItems")} · {hiddenItems.length}
            </button>
          )}
          {categoryList.map((cat: any, catIdx: number) => {
            const isActive = selectedCategoryId === cat.id;
            return (
              <div
                key={cat.id}
                className={cn(
                  "flex shrink-0 items-center rounded-full transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                <button
                  onClick={() => handleSelectCategory(cat.id)}
                  className="px-3 py-1.5 text-xs font-medium"
                >
                  {cat.name} · {itemCountByCategory[cat.id] || 0}
                </button>
                {/* Danh mục đang chọn có menu ⋮ để sửa/đổi vị trí/xóa ngay trên điện thoại */}
                {isActive && (
                  <ActionsMenu
                    label={`${t("menu.actions")} — ${cat.name}`}
                    items={categoryActions(cat, catIdx)}
                    triggerClassName="h-7 w-7 mr-0.5 rounded-full text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  />
                )}
              </div>
            );
          })}
          <button
            onClick={() => {
              setEditingCategory(null);
              setCatDialogOpen(true);
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium bg-muted/50 text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5 inline" />
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{activeCategoryName}</h2>
            <p className="text-sm text-muted-foreground">
              {isReordering
                ? t("menu.dragToReorder")
                : `${visibleItems.length} ${t("menu.products")}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isReordering ? "default" : "outline"}
              disabled={savingOrder || categoryList.length === 0}
              title={t("menu.reorder")}
              onClick={() => (isReordering ? exitReorder() : enterReorder())}
            >
              {isReordering ? (
                <Check className="h-4 w-4 mr-1" />
              ) : (
                <ArrowUpDown className="h-4 w-4 mr-1" />
              )}
              {isReordering ? t("menu.doneReorder") : t("menu.reorder")}
            </Button>
            {!isReordering && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setProdDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("menu.products")}
              </Button>
            )}
          </div>
        </div>
        {isReordering && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">
            {t("menu.reorderScope")} <strong>{activeCategoryName}</strong>
          </p>
        )}

        {/* Search */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("menu.searchPlaceholder")}
        />

        {/* Products grid */}
        {visibleItems.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {t("menu.noItems")}
            </p>
            {!search && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setProdDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("menu.addProduct")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item: any, itemIdx: number) => {
              const available = item.isAvailable ?? item.is_available ?? true;
              const imageUrl = item.imageUrl || item.image_url;
              const itemCategory = categoryList.find(
                (c: any) => c.id === (item.categoryId || item.category_id)
              );
              const itemActions: ActionItem[] = [
                {
                  key: "edit",
                  label: t("menu.editProduct"),
                  icon: Edit,
                  onSelect: () => {
                    setEditingProduct(item);
                    setProdDialogOpen(true);
                  },
                },
                {
                  key: "toggle",
                  label: available ? t("menu.hideItem") : t("menu.showItem"),
                  icon: available ? ToggleLeft : ToggleRight,
                  onSelect: () => handleToggleAvailability(item),
                },
                {
                  key: "image",
                  label: t("menu.changeImage"),
                  icon: ImagePlus,
                  onSelect: () => {},
                  render: (close) => (
                    <div className="flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted">
                      <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <ImageUploadButton
                        currentUrl={imageUrl}
                        onUploaded={(url) => {
                          handleImageUploaded(item, url);
                          close();
                        }}
                        productName={item.name}
                        description={item.description}
                        categoryName={itemCategory?.name}
                      />
                    </div>
                  ),
                },
                {
                  key: "toTop",
                  label: t("menu.moveToTop"),
                  icon: ArrowUpToLine,
                  disabled: savingOrder,
                  onSelect: () => moveItemToEdge(item, "top"),
                },
                {
                  key: "toBottom",
                  label: t("menu.moveToBottom"),
                  icon: ArrowDownToLine,
                  disabled: savingOrder,
                  onSelect: () => moveItemToEdge(item, "bottom"),
                },
                {
                  key: "reorder",
                  label: t("menu.reorder"),
                  icon: ArrowUpDown,
                  // Sắp xếp ngay trong danh mục của chính món này
                  onSelect: () => enterReorder(item.categoryId || item.category_id),
                },
                {
                  key: "delete",
                  label: t("common.delete"),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () =>
                    setConfirmDelete({ type: "product", id: item.id, name: item.name }),
                },
              ];
              return (
                <div
                  key={item.id}
                  draggable={isReordering}
                  onDragStart={() => isReordering && setDragId(item.id)}
                  onDragOver={(e) => isReordering && e.preventDefault()}
                  onDrop={() => isReordering && handleDropOn(item.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn(
                    "relative overflow-hidden rounded-lg border bg-card transition-colors",
                    !available && "opacity-60",
                    isReordering
                      ? "cursor-move border-primary/40 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30",
                    dragId === item.id && "opacity-40",
                    savingOrder && isReordering && "pointer-events-none",
                  )}
                >
                  {/* Product image */}
                  <div className="relative w-full h-36 bg-muted">
                    {imageUrl ? (
                      <img
                        src={toThumbUrl(imageUrl)}
                        alt={item.name}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = imageUrl;
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UtensilsCrossed className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                    {!available && (
                      <Badge
                        variant="secondary"
                        className="absolute top-2 left-2 text-[9px]"
                      >
                        {t("menu.inactive")}
                      </Badge>
                    )}
                    {/* Menu thao tác — LUÔN HIỆN để bấm được trên điện thoại */}
                    {!isReordering && (
                      <div className="absolute right-2 top-2">
                        <ActionsMenu
                          label={`${t("menu.actions")} — ${item.name}`}
                          items={itemActions}
                          triggerClassName="bg-background/85 backdrop-blur-sm hover:bg-background text-foreground shadow-sm"
                        />
                      </div>
                    )}
                    {/* Chế độ sắp xếp: tay cầm kéo (máy tính) + nút lên/xuống (điện thoại) */}
                    {isReordering && (
                      <>
                        <div className="absolute left-2 top-2 rounded-md bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur-sm">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={t("menu.moveUp")}
                            title={t("menu.moveUp")}
                            disabled={itemIdx === 0 || savingOrder}
                            onClick={() => handleMoveItem(itemIdx, -1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("menu.moveDown")}
                            title={t("menu.moveDown")}
                            disabled={itemIdx === visibleItems.length - 1 || savingOrder}
                            onClick={() => handleMoveItem(itemIdx, 1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm">
                          {itemIdx + 1}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Product info */}
                  <div className="p-3">
                    <h4 className="font-medium text-sm leading-tight truncate">
                      {item.name}
                    </h4>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-sm font-semibold">
                        {formatCurrency(item.price)}
                      </p>
                      {selectedCategoryId === "all" && (
                        <span className="text-[10px] text-muted-foreground truncate ml-2">
                          {itemCategory?.name ?? ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {catDialogOpen && (
        <CategoryDialog
          open={catDialogOpen}
          onOpenChange={(v) => {
            setCatDialogOpen(v);
            if (!v) setEditingCategory(null);
          }}
          initial={editingCategory}
        />
      )}
      {prodDialogOpen && (
        <ProductDialog
          open={prodDialogOpen}
          onOpenChange={(v) => {
            setProdDialogOpen(v);
            if (!v) setEditingProduct(null);
          }}
          categories={categoryList}
          allModifierGroups={allModifierGroups}
          initial={editingProduct}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(v) => {
            if (!v) setConfirmDelete(null);
          }}
          title={t("menu.confirmDeleteTitle")}
          description={t("menu.confirmDeleteDesc")}
          onConfirm={handleConfirmDelete}
          loading={deleteCat.isPending || deleteItem.isPending}
        />
      )}
    </div>
  );
}
