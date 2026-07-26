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
