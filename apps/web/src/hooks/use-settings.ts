"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { STATIC_QUERY } from "@/lib/query-config";

// Cài đặt đổi rất thưa → giữ lâu trong bộ nhớ. CỐ Ý chỉ nằm trong RAM, KHÔNG ghi
// xuống localStorage (chứa số tài khoản ngân hàng + khoá webhook) — xem query-config.ts.

export function useOrgSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["settings", "org"],
    queryFn: () => apiFetch("/api/settings/org", { includeBranchHeader: false }),
    enabled: options?.enabled ?? true,
    ...STATIC_QUERY,
  });
}

export function useBranchSettings() {
  return useQuery({
    queryKey: ["settings", "branch"],
    queryFn: () => apiFetch("/api/settings/branch"),
    ...STATIC_QUERY,
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/settings/org", {
        method: "PATCH",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "org"] }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch("/api/settings/branch", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "branch"] }),
  });
}

export function useBranches(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["branches"],
    queryFn: () =>
      apiFetch<{ id: string; name: string; slug: string; address: string | null }[]>(
        "/api/branches",
        { includeBranchHeader: false }
      ),
    enabled: options?.enabled ?? true,
    ...STATIC_QUERY,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string; address?: string; phone?: string; timezone?: string; currency?: string; taxRate?: number; settings?: Record<string, unknown> }) =>
      apiFetch("/api/branches", {
        method: "POST",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useUpdateBranchById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; slug?: string; address?: string; phone?: string; settings?: Record<string, unknown> }) =>
      apiFetch(`/api/branches/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}
