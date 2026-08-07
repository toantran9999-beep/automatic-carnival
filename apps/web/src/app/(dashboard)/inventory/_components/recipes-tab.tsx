"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Coffee } from "lucide-react";
import { SearchInput } from "@/components/search-input";
import {
  useRecipeCoverage,
  useBeanLots,
  useSetBeanLot,
} from "@/hooks/use-inventory";
import { useTranslation } from "@/stores/lang-store";
import { toast } from "sonner";

/**
 * Tab Định lượng: danh sách món kèm badge "Đã có công thức / Chưa có".
 *
 * Bản trước bắt dán UUID món ăn vào một ô text mới xem được công thức — không ai
 * dùng nổi, nên trên thực tế tab này chưa từng được dùng.
 */
export function RecipesTab({
  items,
  onOpenRecipe,
}: {
  items: any[];
  onOpenRecipe: (menuItem: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useRecipeCoverage();

  const menuItems: any[] = data?.items ?? [];
  const configured: number = data?.configured ?? 0;
  const total: number = data?.total ?? 0;

  /** Gom theo danh mục, giữ đúng thứ tự máy chủ đã sắp. */
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { category: string; rows: any[] }[] = [];
    for (const row of menuItems) {
      if (q && !row.name.toLowerCase().includes(q)) continue;
      const last = out[out.length - 1];
      if (last && last.category === row.category_name) last.rows.push(row);
      else out.push({ category: row.category_name, rows: [row] });
    }
    return out;
  }, [menuItems, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("inventory.recipeCoverage")
            .replace("{done}", String(configured))
            .replace("{total}", String(total))}
        </p>
      </div>

      <BeanLotsCard items={items} />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("inventory.searchPlaceholder")}
      />

      {isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("inventory.noItems")}
          </CardContent>
        </Card>
      ) : (
        grouped.map((group) => (
          <Card key={group.category}>
            <CardContent className="p-0">
              <p className="border-b border-border bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground">
                {group.category}
              </p>
              <ul>
                {group.rows.map((row: any) => {
                  const has = row.ingredient_count > 0;
                  return (
                    <li key={row.menu_item_id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenRecipe({ id: row.menu_item_id, name: row.name })
                        }
                        // min-h-[44px]: máy quầy bấm bằng ngón tay, không phải chuột.
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {row.name}
                        </span>
                        <Badge variant={has ? "secondary" : "outline"} className="shrink-0">
                          {has
                            ? `${row.ingredient_count} ${t("inventory.items").toLowerCase()}`
                            : t("inventory.recipeMissing")}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * "Lô hạt đang dùng" — mỗi tùy chọn của nhóm "Loại hạt" trỏ tới một bao hạt cụ thể.
 *
 * Vì sao cần riêng một khối: nhóm tùy chọn trên POS chỉ có Robusta/Arabica/Culi/Mộc,
 * không có vùng trồng. Kho lại đếm theo từng lô ("Hạt Arabica — Brazil Cerrado").
 * Nhập lô Ethiopia thay Brazil mà không đổi ở đây là trừ vào bao đã hết.
 */
function BeanLotsCard({ items }: { items: any[] }) {
  const { t } = useTranslation();
  const { data, isLoading } = useBeanLots();
  const setLot = useSetBeanLot();

  const rows: any[] = data ?? [];

  /** Chỉ hạt cà phê mới là lựa chọn hợp lệ — không ai thay bột cà phê bằng chanh. */
  const beans = useMemo(
    () => items.filter((i: any) => /^h[aạ]t /i.test(i.name)),
    [items],
  );

  // Hạt nền = bao đang bị thay ra ở dòng nào đó. Chưa cấu hình gì thì đoán bằng bao
  // đầu danh sách — người dùng vẫn đổi lại được, và đoán sai cũng chỉ là giá trị
  // gợi ý trên màn hình chứ không ghi vào đâu.
  const baseBeanId = rows.find((r) => r.replaces_item_id)?.replaces_item_id ?? beans[0]?.id;

  if (isLoading || rows.length === 0 || beans.length === 0 || !baseBeanId) return null;

  async function choose(modifierId: string, inventoryItemId: string) {
    try {
      await setLot.mutateAsync({ modifierId, inventoryItemId, replacesItemId: baseBeanId });
      toast.success(t("inventory.saveSuccess"));
    } catch (err) {
      toast.error(`${t("common.error")}: ${(err as Error).message}`);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Coffee className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("inventory.beanLots")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("inventory.beanLotsHelp")}</p>

        {rows.map((row: any) => (
          <div key={row.modifier_id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {row.modifier_name}
            </span>
            <Select
              value={row.inventory_item_id ?? baseBeanId}
              onValueChange={(v) => choose(row.modifier_id, v)}
            >
              <SelectTrigger className="w-56 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {beans.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.id === baseBeanId ? `${b.name} — ${t("inventory.beanLotSame")}` : b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
