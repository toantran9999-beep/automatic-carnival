"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export function useDashboardStats(allBranches?: boolean) {
  return useQuery({
    queryKey: ["dashboard", "stats", allBranches],
    queryFn: () =>
      apiFetch(`/api/reports/dashboard${allBranches ? "?allBranches=true" : ""}`),
    refetchInterval: 30000,
  });
}

export function useRecentOrders() {
  return useQuery({
    queryKey: ["orders", "recent"],
    queryFn: () => apiFetch("/api/orders?limit=5&sort=recent"),
    refetchInterval: 15000,
  });
}

export interface OverviewHour {
  hour: number;
  orders: number;
  revenue: number;
}

export interface OverviewDay {
  date: string;
  orders: number;
  revenue: number;
}

export interface OverviewPaymentMethod {
  method: string;
  amount: number;
  count: number;
}

export interface OverviewTopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface OverviewOrderType {
  type: string;
  orders: number;
  revenue: number;
}

export interface Overview {
  today: {
    orders: number;
    revenue: number;
    averageOrderValue: number;
    activeOrders: number;
    cancelledOrders: number;
    occupiedTables: number;
    totalTables: number;
    /** Tiền đang treo ở các bàn còn khách (chưa thu) — không phải doanh thu. */
    openTablesRevenue: number;
    /** Đơn mang về chưa thu tiền (mọi ngày, không riêng hôm nay). */
    openTakeawayOrders: number;
    /** Tiền đang treo ở đơn mang về (chưa thu) — không chồng lấn openTablesRevenue. */
    openTakeawayRevenue: number;
  };
  yesterday: { orders: number; revenue: number };
  deltas: { revenuePct: number | null; ordersPct: number | null };
  hourly: OverviewHour[];
  days: OverviewDay[];
  paymentMethods: OverviewPaymentMethod[];
  topItems: OverviewTopItem[];
  orderTypes: OverviewOrderType[];
}

/** Toàn bộ dữ liệu trang Tổng quan (quản lý) — 1 lần gọi, tự làm mới mỗi 60s. */
export function useOverview(allBranches?: boolean) {
  return useQuery<Overview>({
    queryKey: ["dashboard", "overview", allBranches],
    queryFn: () =>
      apiFetch<Overview>(`/api/reports/overview${allBranches ? "?allBranches=true" : ""}`),
    refetchInterval: 60000,
  });
}

export interface SalesHistoryMonth {
  month: string; // 'YYYY-MM'
  days: number;
  revenue: number;
  orders: number;
}

export interface SalesHistoryWeekday {
  dow: number; // 0 = Chủ nhật … 6 = Thứ bảy (quy ước Postgres)
  days: number;
  revenue: number;
  orders: number;
}

export interface SalesHistoryItem {
  name: string;
  group: string | null;
  quantity: number;
  revenue: number;
}

export interface SalesHistory {
  /** false = chưa nhập lịch sử → ẩn hẳn khối này. */
  available: boolean;
  range: { first: string | null; last: string | null };
  totals: { days: number; revenue: number; orders: number };
  monthly: SalesHistoryMonth[];
  weekday: SalesHistoryWeekday[];
  topItems: SalesHistoryItem[];
}

/**
 * Lịch sử bán hàng từ POS cũ (trước 26/07/2026). Dữ liệu tĩnh — nhập một lần rồi
 * không đổi nữa — nên KHÔNG đặt refetchInterval như các query sống khác.
 */
export function useSalesHistory() {
  return useQuery<SalesHistory>({
    queryKey: ["dashboard", "history"],
    queryFn: () => apiFetch<SalesHistory>("/api/reports/history"),
    staleTime: 60 * 60_000,
  });
}
