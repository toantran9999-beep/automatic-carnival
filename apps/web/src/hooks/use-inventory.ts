"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Chi nhánh đi qua header `x-branch-id` chứ không nằm trong URL, nên PHẢI nhét vào
 * khoá truy vấn — nếu không, đổi chi nhánh xong vẫn thấy tồn kho của chi nhánh cũ.
 * Tiền tố ["inventory"] giữ nguyên nên mọi lệnh xoá cache sẵn có vẫn quét đúng.
 */
function useBranchKey() {
  return useAuthStore((s) => s.selectedBranchId) ?? "no-branch";
}

export function useInventoryItems() {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "items"],
    queryFn: () => apiFetch("/api/inventory/items"),
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/inventory/items", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, any>) =>
      apiFetch(`/api/inventory/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useInventoryMovements(itemId?: string) {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "movements", itemId],
    queryFn: () =>
      apiFetch(`/api/inventory/movements${itemId ? `?itemId=${itemId}` : ""}`),
  });
}

export function useInventoryAlerts() {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "alerts"],
    queryFn: () => apiFetch("/api/inventory/alerts"),
  });
}

export function useRecipe(menuItemId: string) {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "recipes", menuItemId],
    queryFn: () => apiFetch(`/api/inventory/recipes/${menuItemId}`),
    enabled: !!menuItemId,
  });
}

/** Mọi món trên thực đơn + số nguyên liệu đã cấu hình — dựng danh sách tab Định lượng. */
export function useRecipeCoverage() {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "recipe-coverage"],
    queryFn: () => apiFetch("/api/inventory/recipes"),
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/inventory/recipes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

/**
 * Tra nguyên liệu từ mã vừa quét.
 *
 * Là mutation chứ không phải query: mỗi lần quét là một hành động rời rạc, và mã
 * chưa gắn phải trả lỗi ngay để giao diện mời gắn mã — chứ không nằm im trong cache.
 */
export function useLookupByCode() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch(`/api/inventory/items/lookup?code=${encodeURIComponent(code)}`),
  });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      lines: { itemId: string; quantity: number; unitCost?: number | null }[];
      reference?: string;
      notes?: string;
    }) =>
      apiFetch("/api/inventory/receipts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      lines: { itemId: string; quantity: number }[];
      type: "issue" | "waste" | "adjustment";
      reason: string;
    }) =>
      apiFetch("/api/inventory/issues", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

/** Tùy chọn "Loại hạt" đang trỏ vào lô hạt nào. */
export function useBeanLots() {
  const branch = useBranchKey();
  return useQuery({
    queryKey: ["inventory", branch, "bean-lots"],
    queryFn: () => apiFetch("/api/inventory/bean-lots"),
  });
}

export function useSetBeanLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      modifierId: string;
      inventoryItemId: string;
      replacesItemId: string;
    }) =>
      apiFetch("/api/inventory/bean-lots", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}
