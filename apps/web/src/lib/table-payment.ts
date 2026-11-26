import type { PosCartItem } from "@/app/(dashboard)/pos/page";

export interface TablePayment {
  orderId: string;
  orderNumber: string;
  total: number; // xu
  tax: number; // xu
  cart: PosCartItem[];
}

/**
 * Dựng dữ liệu cho hộp thoại thanh toán từ phiên bàn đang mở
 * (`GET /api/tables/:id/active-session`).
 *
 * ⚠️ Cắt NGUYÊN VĂN từ `handlePayUnpaidOrders` của màn bán hàng — công thức tiền
 * không được đổi: gửi đơn chưa trả ĐẦU TIÊN kèm TỔNG cả phiên, máy chủ tự rải
 * tiền sang các đơn còn lại. Màn Bàn ăn và màn bán hàng cùng gọi hàm này để hai
 * nơi không bao giờ tính lệch nhau.
 *
 * Trả `null` khi bàn không còn đơn nào chưa trả.
 */
export function buildTablePayment(
  activeSession: { orders?: any[] } | null | undefined,
  taxRate: number,
): TablePayment | null {
  const unpaidOrders =
    activeSession?.orders?.filter((o: any) => o.status !== "completed" && o.status !== "cancelled") || [];
  if (unpaidOrders.length === 0) return null;

  const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);
  const unpaidTax = Math.round(unpaidTotal - (unpaidTotal / (1 + (taxRate / 10000))));
  const targetOrder = unpaidOrders[0];

  const allOrderedItems: PosCartItem[] = unpaidOrders.flatMap((order: any) =>
    order.items.map((item: any) => ({
      lineId: item.id,
      menuItemId: item.menu_item_id,
      name: item.name,
      imageUrl: item.image_url || null,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      notes: item.notes || undefined,
      modifiers: item.modifiers || [],
    })),
  );

  return {
    orderId: targetOrder.id,
    orderNumber: targetOrder.order_number,
    total: unpaidTotal,
    tax: unpaidTax,
    cart: allOrderedItems,
  };
}
