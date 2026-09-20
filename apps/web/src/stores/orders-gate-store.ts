import { create } from "zustand";

/**
 * Vé mở khoá tab Đơn hàng — chỉ nằm trong BỘ NHỚ, không ghi xuống máy.
 *
 * ⚠️ CỐ Ý KHÔNG `persist`. Đây chính là chỗ thực hiện luật "mỗi lần vào phải
 * nhập lại": rời trang, F5, đóng app là vé bay — muốn xem đơn cũ thì gõ mã lần
 * nữa. Thêm `persist` vào đây là phá đúng cái luật mà nó sinh ra để giữ.
 *
 * Khác hẳn `station-store` (cái đó cố ý nhớ theo thiết bị) — đừng chép khuôn
 * nhầm chỗ.
 *
 * Máy chủ cũng chỉ cấp vé sống 5 phút, nên kể cả có ai cố lưu lại thì cũng vô
 * ích: khoá thật nằm ở `requireOrdersGate` phía máy chủ, không phải ở đây.
 */
interface OrdersGateState {
  ticket: string | null;
  setTicket: (ticket: string) => void;
  clearTicket: () => void;
}

export const useOrdersGateStore = create<OrdersGateState>((set) => ({
  ticket: null,
  setTicket: (ticket) => set({ ticket }),
  clearTicket: () => set({ ticket: null }),
}));
