"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

interface OrderFilters {
  status?: string;
  page?: number;
  limit?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OrdersResponse {
  orders: any[];
  pagination: Pagination;
}

/**
 * ⚠️ Trước đây hàm này tự gọi `fetch` vì máy chủ trả `pagination` NGOÀI `data`,
 * mà `apiFetch` chỉ trả về `json.data`. Bản tự viết đó **thiếu phần tự làm mới
 * phiên**, nên hết hạn token là riêng trang Đơn hàng chết trong khi các trang
 * khác vẫn chạy — rất khó đoán ra nguyên nhân.
 *
 * Máy chủ đã chuyển `pagination` vào trong `data`, nên giờ dùng `apiFetch` như
 * mọi chỗ khác: có tự làm mới phiên, tự gắn `x-branch-id`.
 */
export function useOrders(filters?: OrderFilters) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();

  return useQuery<OrdersResponse>({
    queryKey: ["orders", filters],
    queryFn: () => apiFetch<OrdersResponse>(`/api/orders${qs ? `?${qs}` : ""}`),
    refetchInterval: 5000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

/**
 * Thêm món vào đơn ĐANG MỞ (khách mang về quay lại mua thêm). Đơn giữ nguyên số,
 * tiền cộng dồn; quầy in một phiếu riêng chỉ gồm món vừa thêm.
 */
export function useAddOrderItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, items }: { orderId: string; items: any[] }) =>
      apiFetch(`/api/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useUpdateOrderItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      itemId,
      status,
    }: {
      orderId: string;
      itemId: string;
      status: string;
    }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
