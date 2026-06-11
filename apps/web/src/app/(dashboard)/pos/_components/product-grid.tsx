"use client";

import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Search, Loader2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { TodaMark } from "@/components/toda-mark";
import { useTranslation } from "@/stores/lang-store";
import type { PosCartItem } from "../page";

// Tông màu gradient ổn định theo danh mục (placeholder khi món chưa có ảnh).
function catHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

function BrandPlaceholder({ categoryName, seed }: { categoryName?: string; seed: string }) {
  const h = catHue(seed || categoryName || "toda");
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: `linear-gradient(135deg, hsl(${h} 30% 32%), hsl(${(h + 38) % 360} 34% 22%))`,
      }}
    >
      <TodaMark size={34} className="text-white/85" />
      <span className="mt-1.5 text-[11px] font-semibold tracking-wide text-white/80">
        Toda Café
      </span>
      {categoryName && (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/30 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/85">
          {categoryName}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductGrid
// ---------------------------------------------------------------------------

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
}) {
  const { t } = useTranslation();

  const availableItems = items.filter((i: any) => i.is_available);
  const countAll = availableItems.length;
  const countByCat = (id: string) =>
    availableItems.filter((i: any) => i.category_id === id).length;
  const catName = (id: string | null) =>
    categories.find((c: any) => c.id === id)?.name as string | undefined;

  const filteredItems = availableItems.filter((item: any) => {
    if (selectedCategory && item.category_id !== selectedCategory) return false;
    if (search) return item.name.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Search (gọn, không tiêu đề thừa — tối ưu màn POS ngang) */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("pos.searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-11 rounded-xl"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category tabs — cuộn ngang 1 hàng (đỡ tốn chiều cao) */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          className="gap-1.5 shrink-0 whitespace-nowrap"
          onClick={() => onCategoryChange(null)}
        >
          {t("common.all")}
          <span className="rounded-full bg-black/15 px-1.5 text-[11px] font-semibold tabular-nums dark:bg-white/15">
            {countAll}
          </span>
        </Button>
        {categories.map((cat: any) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => onCategoryChange(cat.id)}
          >
            {cat.name}
            <span className="rounded-full bg-black/15 px-1.5 text-[11px] font-semibold tabular-nums dark:bg-white/15">
              {countByCat(cat.id)}
            </span>
          </Button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("pos.noProducts")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
            {filteredItems.map((item: any) => {
              const inCartQty = cart
                .filter((c) => c.menuItemId === item.id)
                .reduce((sum, c) => sum + c.quantity, 0);

              return (
                <button
                  key={item.id}
                  onClick={() => onItemClick(item)}
                  className="group relative text-left rounded-xl border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  {/* Image / branded placeholder — thấp lại trên màn lớn để hiện nhiều hàng */}
                  <div className="aspect-[4/3] lg:aspect-auto lg:h-28 xl:h-24 bg-muted relative overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <BrandPlaceholder categoryName={catName(item.category_id)} seed={item.id} />
                    )}
                    {inCartQty > 0 && (
                      <Badge className="absolute top-1.5 right-1.5 h-6 min-w-6 justify-center text-xs shadow-lg">
                        {inCartQty}
                      </Badge>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-sm font-medium leading-snug line-clamp-2">{item.name}</p>
                    <p className="text-sm font-bold text-primary mt-1 tabular-nums">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
