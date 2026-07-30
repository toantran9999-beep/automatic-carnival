"use client";

import { formatCurrency } from "@/lib/utils";

/** Tùy chọn kèm phụ trội MỖI ĐƠN VỊ (âm = giảm giá, VD "Nhẹ" = -200000 xu). */
export interface ItemLineModifier {
  name: string;
  price: number;
}

/**
 * ⚠️ QUY ƯỚC TIỀN — giống hệt `print-ticket.tsx`, đừng lệch:
 * - `unit_price`: giá gốc 1 đơn vị, **CHƯA** gồm tùy chọn
 * - `total`: tiền cả dòng, **ĐÃ** gồm tùy chọn
 * - `modifiers[].price`: phụ trội **mỗi đơn vị**
 *
 * Bất biến: `Σ(unit_price×qty + Σ(mod.price×qty))` phải bằng tổng đơn. Đây cũng là
 * cách tự kiểm nhanh nhất khi nghi số sai: cộng dọc trên màn hình.
 */
export interface ItemLine {
  id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total?: number;
  notes?: string;
  modifiers?: ItemLineModifier[];
  /** Ghi kèm bên phải tên món, VD "14:35 · Tuấn" — dùng cho món gọi thêm. */
  meta?: string;
}

/** "+5.000đ" / "-2.000đ"; rỗng khi tùy chọn không đổi giá → khỏi in cột tiền trống. */
function modMoney(cents: number): string {
  if (!cents) return "";
  return `${cents > 0 ? "+" : "-"}${formatCurrency(Math.abs(cents))}`;
}

/**
 * Danh sách món kèm dòng phụ cho từng tùy chọn — dùng chung cho hộp thoại "Bàn đang
 * có khách" (Tổng quan) và hộp thoại chi tiết đơn (Đơn hàng).
 *
 * Vì sao phải có dòng phụ: "Bạc xỉu" giá gốc 20.000đ nhưng chọn "Nhẹ" thì thu
 * 18.000đ — không hiện dòng `- Nhẹ  -2.000đ` thì con số trông như tính sai.
 */
export function OrderItemLines({ items }: { items: ItemLine[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, idx) => {
        const mods = item.modifiers ?? [];
        return (
          <li key={item.id ?? idx} className="text-sm">
            <div className="flex items-start gap-2">
              {/* min-w-0 để tên món co lại trước; KHÔNG truncate — tên món là thứ
                  chính cần đọc, dài thì xuống dòng. */}
              <span className="min-w-0 flex-1 leading-snug text-foreground">
                <span className="tabular-nums text-muted-foreground">{item.quantity}x</span>{" "}
                {item.name}
                {item.meta && (
                  <span className="ml-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    {item.meta}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {formatCurrency(item.unit_price * item.quantity)}
              </span>
            </div>

            {mods.map((mod, mi) => {
              const money = modMoney(mod.price * item.quantity);
              return (
                <div key={mi} className="flex items-start gap-2 pl-4 text-xs">
                  <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                    - {mod.name}
                  </span>
                  {money && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">{money}</span>
                  )}
                </div>
              );
            })}

            {item.notes && (
              <div className="pl-4 text-xs italic leading-snug text-muted-foreground">
                * {item.notes}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
