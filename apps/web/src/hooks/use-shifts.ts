"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export interface ShiftSummary {
  cashSales: number;
  totalSales: number;
  orderCount: number;
  expectedCash: number;
  byMethod: Record<string, number>;
}

export interface CurrentShift {
  id: string;
  status: string;
  opened_at: string;
  opening_cash: number;
  summary: ShiftSummary;
}

/** Ca đang mở của chi nhánh (null nếu chưa mở). */
export function useCurrentShift() {
  return useQuery<CurrentShift | null>({
    queryKey: ["shifts", "current"],
    queryFn: () => apiFetch("/api/shifts/current"),
    refetchInterval: 30000,
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
