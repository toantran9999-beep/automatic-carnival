"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

// --- Categories ---

export function useCategories() {
  return useQuery({
    queryKey: ["menu", "categories"],
    queryFn: () => apiFetch("/api/menu/categories"),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/menu/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      apiFetch(`/api/menu/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/menu/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// --- Menu Items ---

export function useMenuItems(categoryId?: string) {
  return useQuery({
    queryKey: ["menu", "items", categoryId],
    queryFn: () =>
      apiFetch(`/api/menu/items${categoryId ? `?categoryId=${categoryId}` : ""}`),
  });
}

export interface BestSellerRow {
  menuItemId: string;
  quantity: number;
}

/**
 * Top món bán chạy cho nhóm "Bán chạy" trên POS.
 * Dùng root key riêng (không lồng trong ["menu"]) để mỗi lần sửa món không phải tải lại;
 * số bán chạy đổi rất chậm nên cache 10 phút, không cần refetch theo chu kỳ.
 */
export function useBestSellers() {
  return useQuery<BestSellerRow[]>({
    queryKey: ["best-sellers"],
    queryFn: () => apiFetch<BestSellerRow[]>("/api/menu/best-sellers"),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/menu/items", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      apiFetch(`/api/menu/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/menu/items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// --- Modifier Groups ---

export function useModifierGroups() {
  return useQuery({
    queryKey: ["menu", "modifier-groups"],
    queryFn: () => apiFetch("/api/menu/modifier-groups"),
  });
}

export function useCreateModifierGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/menu/modifier-groups", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useUpdateModifierGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      apiFetch(`/api/menu/modifier-groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useDeleteModifierGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/menu/modifier-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// --- Modifiers ---

export function useAddModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/menu/modifiers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useUpdateModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      apiFetch(`/api/menu/modifiers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useDeleteModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/menu/modifiers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// --- Item ↔ Modifier Group Links ---

export function useItemModifierGroups(itemId: string) {
  return useQuery({
    queryKey: ["menu", "items", itemId, "modifier-groups"],
    queryFn: () => apiFetch(`/api/menu/items/${itemId}/modifier-groups`),
    enabled: !!itemId,
  });
}

export function useLinkModifierGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, groupId }: { itemId: string; groupId: string }) =>
      apiFetch(`/api/menu/items/${itemId}/modifier-groups`, {
        method: "POST",
        body: JSON.stringify({ groupId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

export function useUnlinkModifierGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, groupId }: { itemId: string; groupId: string }) =>
      apiFetch(`/api/menu/items/${itemId}/modifier-groups/${groupId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}
