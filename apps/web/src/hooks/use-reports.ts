"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export interface SalesReportDay {
  date: string;
  orders: number;
  revenue: number;
}

export interface PaymentMethodShare {
  name: string;
  /** Phần trăm ĐÃ làm tròn — chỉ để hiện, đừng chia lát biểu đồ bằng số này. */
  value: number;
  /** Số tiền (xu). Chia lát và hiện tiền đều dùng cột này. */
  amount: number;
  /** Số lượt thanh toán bằng phương thức này. */
  count: number;
}

export interface BranchSalesShare {
  branchId: string;
  name: string;
  orders: number;
  revenue: number;
}

export interface SalesReportData {
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  days: SalesReportDay[];
  paymentMethods: PaymentMethodShare[];
  branches?: BranchSalesShare[];
}

export interface TopItemReport {
  name: string;
  totalQuantity: number;
  totalRevenue: number;
}

export function useSalesReport(startDate?: string, endDate?: string, allBranches?: boolean) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (allBranches) params.set("allBranches", "true");
  const qs = params.toString();

  return useQuery<SalesReportData>({
    queryKey: ["reports", "sales", startDate, endDate, allBranches],
    queryFn: () => apiFetch<SalesReportData>(`/api/reports/sales${qs ? `?${qs}` : ""}`),
    enabled: !!startDate && !!endDate,
  });
}

export function useTopItems(startDate?: string, endDate?: string, limit?: number, allBranches?: boolean) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (limit) params.set("limit", String(limit));
  if (allBranches) params.set("allBranches", "true");
  const qs = params.toString();

  return useQuery<TopItemReport[]>({
    queryKey: ["reports", "top-items", startDate, endDate, limit, allBranches],
    queryFn: () =>
      apiFetch<TopItemReport[]>(`/api/reports/top-items${qs ? `?${qs}` : ""}`),
    enabled: !!startDate && !!endDate,
  });
}
