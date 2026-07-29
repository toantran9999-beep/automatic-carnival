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

export interface SalesReportWeekday {
  /** 0 = Chủ nhật … 6 = Thứ bảy (quy ước `extract(dow …)` của Postgres). */
  dow: number;
  days: number;
  orders: number;
  revenue: number;
  /** Trung bình mỗi ngày — mỗi thứ có số ngày khác nhau trong kỳ nên phải so cái này. */
  avgRevenue: number;
}

export interface SalesReportData {
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  /** 'month' khi khoảng dài hơn 92 ngày — lúc đó `days[].date` là 'YYYY-MM'. */
  granularity: "day" | "month";
  days: SalesReportDay[];
  weekday: SalesReportWeekday[];
  paymentMethods: PaymentMethodShare[];
  branches?: BranchSalesShare[];
  /**
   * Ngày đầu tiên có dữ liệu đầy đủ (hình thức thanh toán, ca làm, theo giờ).
   * Trước ngày này là số nhập từ POS cũ — chỉ có doanh thu, số hoá đơn và món.
   */
  liveDataFrom: string | null;
  /** >0 nghĩa là khoảng đang chọn lấn vào dữ liệu cũ → phải ghi chú ở panel thiếu. */
  legacyDaysInRange: number;
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
