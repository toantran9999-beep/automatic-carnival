"use client";
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";
import { STATIC_QUERY } from "@/lib/query-config";

/**
 * Chi nhánh đi qua header `x-branch-id` chứ không nằm trong URL, nên PHẢI nhét vào
 * khoá truy vấn — nếu không, cache thực đơn lưu trên máy sẽ trả món của chi nhánh cũ
 * cho chi nhánh mới sau khi mở lại app. Tiền tố ["menu"] giữ nguyên nên mọi lệnh xoá
 * cache sẵn có vẫn quét đúng.
 */
function useBranchKey() {
  return useAuthStore((s) => s.selectedBranchId) ?? "no-branch";
}

/**
 * Khai báo 3 truy vấn màn Bán hàng cần — dùng chung cho cả lúc hiển thị lẫn lúc hâm
 * nóng trước từ trang Bàn ăn (`usePrefetchPosMenu`). Một chỗ khai báo để khoá và lệnh
 * gọi không bao giờ lệch nhau; lệch là hâm nóng xong vẫn phải tải lại.
 */
const categoriesQuery = (branch: string) => ({
  queryKey: ["menu", branch, "categories"],
  queryFn: () => apiFetch("/api/menu/categories"),
  ...STATIC_QUERY,
});

const itemsQuery = (branch: string, categoryId?: string) => ({
  queryKey: ["menu", branch, "items", categoryId],
  queryFn: () =>
    apiFetch(`/api/menu/items${categoryId ? `?categoryId=${categoryId}` : ""}`),
  ...STATIC_QUERY,
});

const bestSellersQuery = (branch: string) => ({
  queryKey: ["best-sellers", branch],
  queryFn: () => apiFetch<BestSellerRow[]>("/api/menu/best-sellers"),
  ...STATIC_QUERY,
  staleTime: 10 * 60_000,
  refetchOnWindowFocus: false,
});

/**
 * Tải sẵn thực đơn cho màn Bán hàng. Gọi từ trang Bàn ăn — chỗ nhân viên đứng chờ
 * giữa hai lượt khách — để lúc bấm vô bàn chỉ còn phải chờ đúng phiên của bàn đó.
 * Dùng lại đúng 3 khai báo ở trên nên khoá không bao giờ lệch với lúc hiển thị
 * (lệch khoá thì hâm nóng xong vẫn phải tải lại, coi như công cốc).
 */
export function usePrefetchPosMenu() {
  const qc = useQueryClient();
  const branch = useBranchKey();
  return useCallback(() => {
    void qc.prefetchQuery(categoriesQuery(branch));
    void qc.prefetchQuery(itemsQuery(branch));
    void qc.prefetchQuery(bestSellersQuery(branch));
  }, [qc, branch]);
}

// --- Categories ---

export function useCategories() {
  return useQuery(categoriesQuery(useBranchKey()));
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
  return useQuery(itemsQuery(useBranchKey(), categoryId));
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
  return useQuery<BestSellerRow[]>(bestSellersQuery(useBranchKey()));
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
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["menu", branch, "modifier-groups"],
    queryFn: () => apiFetch("/api/menu/modifier-groups"),
    ...STATIC_QUERY,
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
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["menu", branch, "items", itemId, "modifier-groups"],
    queryFn: () => apiFetch(`/api/menu/items/${itemId}/modifier-groups`),
    enabled: !!itemId,
    ...STATIC_QUERY,
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
