import { create } from "zustand";
import type { CartItem } from "@restai/types";

/**
 * Chữ ký nhận dạng MỘT dòng giỏ = món + đúng bộ tùy chọn đã chọn.
 *
 * ⚠️ Trước đây giỏ nhận dạng dòng CHỈ bằng `menuItemId`, nên hai lần gọi cùng một
 * món với tùy chọn khác nhau bị gộp làm một và tùy chọn của lần sau bị vứt. Hỏng
 * cả hai chiều, và hỏng bằng tiền thật:
 *  - Khách gọi 1 ly "ít đường" rồi gọi tiếp 1 ly "thêm shot +10.000đ" → gộp thành
 *    2 ly theo tùy chọn của lần đầu → quán thu thiếu 10.000đ, mà quầy cũng không
 *    biết là có ly thêm shot.
 *  - Khách chọn "thêm trân châu" rồi bấm nút + ở ngoài menu → ly thứ hai tự dính
 *    trân châu → thu thừa của khách.
 *
 * Sắp xếp id trước khi ghép: chọn [A,B] và [B,A] là cùng một ly.
 *
 * ⚠️ Ghép CẢ con số của tùy chọn kiểu gõ số ("Đường 9g" vs "Đường 15g"): hai ly đó
 * cùng `modifierId` nên chỉ ghép id là gộp làm một, đúng lỗi vừa vá ở trên. Hiện
 * khách quét QR chưa gõ số được, nhưng để sẵn thì sau này mở ra khỏi vỡ âm thầm.
 */
export function cartLineKey(
  menuItemId: string,
  modifiers: { modifierId: string; value?: number | null }[],
): string {
  const mods = modifiers
    .map((m) => (m.value === null || m.value === undefined ? m.modifierId : `${m.modifierId}:${m.value}`))
    .sort()
    .join(",");
  return mods ? `${menuItemId}|${mods}` : menuItemId;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: (taxRate: number) => number;
  getTotal: (taxRate: number) => number;
  getItemCount: () => number;
  /** Tổng số lượng của MỘT món, cộng hết mọi tổ hợp tùy chọn (cho badge ở menu). */
  getQtyForMenuItem: (menuItemId: string) => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) => {
    const items = get().items;
    const key = cartLineKey(item.menuItemId, item.modifiers);
    const existing = items.find((i) => cartLineKey(i.menuItemId, i.modifiers) === key);
    if (existing) {
      set({
        items: items.map((i) =>
          cartLineKey(i.menuItemId, i.modifiers) === key
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        ),
      });
    } else {
      set({ items: [...items, item] });
    }
  },
  removeItem: (lineKey) => {
    set({
      items: get().items.filter((i) => cartLineKey(i.menuItemId, i.modifiers) !== lineKey),
    });
  },
  updateQuantity: (lineKey, quantity) => {
    if (quantity <= 0) {
      get().removeItem(lineKey);
      return;
    }
    set({
      items: get().items.map((i) =>
        cartLineKey(i.menuItemId, i.modifiers) === lineKey ? { ...i, quantity } : i
      ),
    });
  },
  clearCart: () => set({ items: [] }),
  getSubtotal: () => {
    return get().items.reduce((sum, item) => {
      const modifiersTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
      return sum + (item.unitPrice + modifiersTotal) * item.quantity;
    }, 0);
  },
  getTax: (taxRate) => {
    const total = get().getSubtotal();
    return Math.round(total - (total / (1 + (taxRate / 10000))));
  },
  getTotal: (taxRate) => {
    return get().getSubtotal();
  },
  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
  getQtyForMenuItem: (menuItemId) => {
    return get()
      .items.filter((i) => i.menuItemId === menuItemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  },
}));
