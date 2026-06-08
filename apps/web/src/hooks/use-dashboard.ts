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
