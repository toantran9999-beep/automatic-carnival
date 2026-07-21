"use client";

import { useMemo } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Search, Loader2, X, PencilLine } from "lucide-react";
import { toThumbUrl } from "@/lib/image-thumb";
import { TodaMark } from "@/components/toda-mark";
import { useTranslation } from "@/stores/lang-store";
import type { PosCartItem } from "../page";

/** Giá gọn kiểu iPOS: 1.500.000 cents → "15K", 1.550.000 → "15.5K" */
function formatK(cents: number): string {
  const thousands = cents / 100 / 1000;
  if (thousands >= 1) {
    const rounded = Math.round(thousands * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}K`;
  }
  return `${Math.round(cents / 100).toLocaleString("vi-VN")}`;
}

function catHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

function BrandPlaceholder({ categoryName, seed }: { categoryName?: string; seed: string }) {
  const h = catHue(seed || categoryName || "toda");

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(135deg, hsl(${h} 30% 94%), hsl(${(h + 34) % 360} 30% 88%))`,
      }}
    >
      <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-white/45" />
      <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-black/5" />
      <TodaMark size={30} className="relative text-foreground/55" />
      {categoryName && (
        <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground shadow-sm">
          {categoryName}
        </span>
      )}
    </div>
  );
}

export function ProductGrid({
  categories,
  items,
  isLoading,
  search,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  cart,
  onItemClick,
  onAddCustom,
}: {
  categories: any[];
  items: any[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string | null;
  onCategoryChange: (id: string | null) => void;
  cart: PosCartItem[];
  onItemClick: (item: any) => void;
  onAddCustom?: () => void;
}) {
  const { t, lang } = useTranslation();

  const availableItems = useMemo(
    () => items.filter((i: any) => i.is_available),
    [items]
  );

  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of availableItems) {
      if (!item.category_id) continue;
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    }
    return counts;
  }, [availableItems]);

  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const category of categories) names.set(category.id, category.name);
    return names;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    // Đang tìm kiếm → quét TOÀN BỘ món (bỏ lọc danh mục) vì không còn tab "Tất cả"
    if (normalizedSearch) {
      return availableItems.filter((item: any) => item.name.toLowerCase().includes(normalizedSearch));
    }
    return availableItems.filter(
      (item: any) => !selectedCategory || item.category_id === selectedCategory
    );
  }, [availableItems, search, selectedCategory]);

  return (
    <div className="flex min-w-0 flex-1 gap-0">
      {/* Rail danh mục dọc bên trái (tablet/desktop) — kiểu iPOS, không có "Tất cả" cho nhẹ */}
      <div className="hidden w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r pr-2 md:flex xl:w-44">
        {categories.map((cat: any) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "ghost"}
            className="h-12 w-full shrink-0 justify-between rounded-lg px-3 text-sm font-semibold"
            onClick={() => onCategoryChange(cat.id)}
          >
            <span className="min-w-0 truncate text-left">{cat.name}</span>
            <span className="ml-1.5 rounded-full bg-black/15 px-1.5 text-[11px] font-bold tabular-nums dark:bg-white/15">
              {countByCategory.get(cat.id) ?? 0}
            </span>
          </Button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:pl-3">
      <div className="sticky top-0 z-10 bg-background/95 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("pos.searchPlaceholder")}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-11 rounded-lg border-border/70 bg-card pl-9 pr-11 text-base shadow-sm md:text-sm"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
          {onAddCustom && (
            <Button
              type="button"
              variant="outline"
              onClick={onAddCustom}
              className="h-11 shrink-0 gap-1.5 rounded-lg px-3 font-semibold"
              title={lang === "vi" ? "Món ngoài menu" : "Off-menu item"}
            >
              <PencilLine className="h-4 w-4" />
              <span className="hidden sm:inline">
                {lang === "vi" ? "Món khác" : "Custom"}
              </span>
            </Button>
          )}
        </div>

        {/* Pill ngang chỉ dùng cho điện thoại (màn hẹp không đủ chỗ cho rail) */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {categories.map((cat: any) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              className="h-10 shrink-0 gap-1.5 rounded-lg px-4 text-sm font-semibold"
              onClick={() => onCategoryChange(cat.id)}
            >
              <span className="max-w-36 truncate">{cat.name}</span>
              <span className="rounded-full bg-black/15 px-1.5 text-[11px] font-bold tabular-nums dark:bg-white/15">
                {countByCategory.get(cat.id) ?? 0}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 pt-0.5 md:pb-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {t("pos.noProducts")}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(152px,1fr))] gap-2">
            {filteredItems.map((item: any) => {
              const inCartQty = cart
                .filter((c) => c.menuItemId === item.id)
                .reduce((sum, c) => sum + c.quantity, 0);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="group relative overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  title={item.name}
                >
                  <div className="relative h-24 overflow-hidden bg-muted md:h-[88px] xl:h-24">
                    {item.image_url ? (
                      <img
                        src={toThumbUrl(item.image_url)}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = item.image_url!;
                        }}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <BrandPlaceholder
                        categoryName={categoryNames.get(item.category_id)}
                        seed={item.id}
                      />
                    )}
                    {/* Badge giá kiểu iPOS ở góc trên-phải */}
                    <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white shadow">
                      {formatK(item.price)}
                    </span>
                    {inCartQty > 0 && (
                      <Badge className="absolute left-1 top-1 h-6 min-w-6 justify-center rounded-full text-xs shadow-lg">
                        {inCartQty}
                      </Badge>
                    )}
                  </div>

                  <div className="flex min-h-[44px] items-center p-2">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug">
                      {item.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
