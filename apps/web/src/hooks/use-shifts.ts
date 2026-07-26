"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { LIVE_QUERY } from "@/lib/query-config";

export interface ShiftSummary {
  cashSales: number;
  totalSales: number;
  orderCount: number;
  expectedCash: number;
  byMethod: Record<string, number>;
}

export interface DaySummary {
  dayStart: string;
  totalOrders: number;
  totalRevenue: number;
  cancelledOrders: number;
}

export interface CurrentShift {
  id: string;
  status: string;
  opened_at: string;
  opening_cash: number;
  /** Tên người mở ca = thu ngân trực ca; in lên phiếu đặt món. */
  opened_by_name?: string | null;
  summary: ShiftSummary;
  daySummary: DaySummary;
}

export interface ShiftHistoryEntry {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_difference: number;
  cash_sales: number;
  total_sales: number;
  order_count: number;
  sales_by_method: Record<string, number>;
  day_summary: DaySummary | null;
  note: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
}

/** Ca đang mở của chi nhánh (null nếu chưa mở). */
export function useCurrentShift() {
  return useQuery<CurrentShift | null>({
    queryKey: ["shifts", "current"],
    queryFn: () => apiFetch("/api/shifts/current"),
    refetchInterval: 30000,
    ...LIVE_QUERY,
  });
}

/** Lịch sử các ca đã đóng (thống kê hàng ngày), mới nhất trước. */
export function useShiftHistory(limit = 30) {
  return useQuery<ShiftHistoryEntry[]>({
    queryKey: ["shifts", "history", limit],
    queryFn: () => apiFetch(`/api/shifts/history?limit=${limit}`),
  });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { openingCash: number; note?: string }) =>
      apiFetch("/api/shifts/open", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { closingCash: number; note?: string }) =>
      apiFetch("/api/shifts/close", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

