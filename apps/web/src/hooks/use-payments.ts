"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: () => apiFetch("/api/payments"),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/payments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useCreatePaymentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderId: string; amount?: number; provider?: "sepay" | "momo" }) =>
      apiFetch("/api/payments/requests", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function usePaymentRequest(id?: string) {
  return useQuery({
    queryKey: ["payments", "requests", id],
    queryFn: () => apiFetch(`/api/payments/requests/${id}`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

/**
 * Phiếu QR còn hiệu lực của một đơn — để hộp thoại thanh toán mở lên là nhận
 * lại đúng phiếu đã in, thay vì bắt thu ngân in thêm phiếu mới.
 *
 * Cố ý KHÔNG có `refetchInterval`: đây là truy vấn một lần lúc mở hộp thoại.
 * Việc theo dõi trạng thái "đã nhận tiền chưa" là của `usePaymentRequest`.
 */
export function useActivePaymentRequestByOrder(orderId?: string, enabled = true) {
  return useQuery({
    queryKey: ["payments", "requests", "by-order", orderId],
    queryFn: () => apiFetch(`/api/payments/requests/by-order/${orderId}`),
    enabled: Boolean(orderId) && enabled,
    staleTime: 0,
  });
}

export function usePaymentSummary() {
  return useQuery({
    queryKey: ["payments", "summary"],
    queryFn: () => apiFetch("/api/payments/summary"),
  });
}

export function useUnpaidOrders() {
  return useQuery({
    queryKey: ["payments", "unpaid-orders"],
    queryFn: () => apiFetch("/api/payments/unpaid-orders"),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiFetch("/api/invoices"),
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/invoices", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
