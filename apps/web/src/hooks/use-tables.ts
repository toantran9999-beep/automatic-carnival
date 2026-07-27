"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { LIVE_QUERY, STATIC_QUERY } from "@/lib/query-config";

// --- Spaces ---

export function useSpaces() {
  return useQuery({
    queryKey: ["spaces"],
    queryFn: () => apiFetch("/api/spaces"),
    ...STATIC_QUERY,
  });
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; floorNumber?: number; sortOrder?: number }) =>
      apiFetch("/api/spaces", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

export function useUpdateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; floorNumber?: number; sortOrder?: number; isActive?: boolean }) =>
      apiFetch(`/api/spaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

export function useDeleteSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/spaces/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

// --- Tables ---

export function useTables(spaceId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["tables", spaceId],
    queryFn: () => {
      const params = spaceId ? `?spaceId=${spaceId}` : "";
      return apiFetch(`/api/tables${params}`);
    },
    // `enabled` để nơi CHỈ THỈNH THOẢNG cần bàn (hộp thoại chi tiết ở Bảng điều
    // khiển) không kéo dữ liệu sẵn. Đây là truy vấn nặng: bàn + phiên + đơn + món.
    enabled: options?.enabled ?? true,
    // Dữ liệu sống: vẽ ngay bản trước cho đỡ chớp, nhưng luôn gọi lại nền
    ...LIVE_QUERY,
  });
}

/**
 * Bàn cho màn SƠ ĐỒ PHÂN BỔ (quản lý sắp xếp chỗ).
 *
 * ⚠️ Khoá bộ nhớ đệm RIÊNG (`"tables-layout"`), KHÔNG dùng chung với `useTables`:
 * nếu dùng chung, bản không-có-dữ-liệu-khách sẽ đè lên bản đầy đủ mà trang Bàn ăn
 * đang dùng, làm thẻ bàn mất tên khách và số tiền.
 *
 * Máy chủ không trả tên khách / số tiền cho đường này (`?layout=1`) — dữ liệu
 * không rời máy chủ, chứ không phải tải về rồi ẩn.
 *
 * Dùng STATIC_QUERY: sơ đồ chỗ ngồi cả tháng không đổi, không cần gọi lại liên tục.
 */
export function useTablesLayout() {
  return useQuery({
    queryKey: ["tables-layout"],
    queryFn: () => apiFetch("/api/tables?layout=1"),
    ...STATIC_QUERY,
  });
}

/**
 * ⚠️ Các thao tác SẮP XẾP bàn (tạo/sửa/xoá/đổi vị trí) phải làm mới CẢ HAI kho:
 * `["tables"]` (trang Bàn ăn) và `["tables-layout"]` (màn Sơ đồ bàn). Quên một
 * bên là hai màn hiện hai thứ khác nhau cho tới khi tải lại trang.
 */
function invalidateTableSetup(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tables"] });
  qc.invalidateQueries({ queryKey: ["tables-layout"] });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { number: number; capacity?: number; spaceId?: string }) =>
      apiFetch("/api/tables", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateTableSetup(qc),
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; capacity?: number; spaceId?: string | null }) =>
      apiFetch(`/api/tables/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateTableSetup(qc),
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateTableSetup(qc),
  });
}

export function useUpdateTablePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) =>
      apiFetch(`/api/tables/${id}/position`, {
        method: "PATCH",
        body: JSON.stringify({ x, y }),
      }),
    // Vẽ vị trí mới ngay, không đợi máy chủ — kéo thả mà giật là rất khó dùng.
    // Phải đổi ở CẢ HAI kho vì màn Sơ đồ bàn đọc `["tables-layout"]`.
    onMutate: async ({ id, x, y }) => {
      await qc.cancelQueries({ queryKey: ["tables"] });
      await qc.cancelQueries({ queryKey: ["tables-layout"] });
      const move = (old: any) => {
        if (!old?.tables) return old;
        return {
          ...old,
          tables: old.tables.map((t: any) =>
            t.id === id ? { ...t, position_x: x, position_y: y } : t
          ),
        };
      };
      const previous = qc.getQueryData(["tables"]);
      const previousLayout = qc.getQueryData(["tables-layout"]);
      qc.setQueryData(["tables"], move);
      qc.setQueryData(["tables-layout"], move);
      return { previous, previousLayout };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(["tables"], context.previous);
      if (context?.previousLayout) qc.setQueryData(["tables-layout"], context.previousLayout);
    },
    onSettled: () => invalidateTableSetup(qc),
  });
}

export function useUpdateTableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/tables/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables"] }),
  });
}

// --- Sessions ---

export function useSessions(status?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["sessions", status],
    queryFn: () => apiFetch(`/api/tables/sessions${qs ? `?${qs}` : ""}`),
    refetchInterval: 5000,
  });
}

// --- Pending Sessions ---

export function usePendingSessions() {
  return useQuery({
    queryKey: ["tables", "sessions", "pending"],
    queryFn: () => apiFetch("/api/tables/sessions/pending"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
}

export function useApproveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/sessions/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["tables", "sessions", "pending"] });
    },
  });
}

export function useRejectSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/sessions/${id}/reject`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["tables", "sessions", "pending"] });
    },
  });
}

export function useEndSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/sessions/${id}/end`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["tables", "sessions", "pending"] });
    },
  });
}

export function useVoidTableSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/sessions/${id}/void`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export interface TakeawayOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number;
  tax: number;
  created_at: string;
  itemSummary: string;
  items: {
    id: string;
    menuItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    notes?: string;
    modifiers: { modifierId: string; name: string; price: number }[];
  }[];
}

export function useTakeawayOrders() {
  return useQuery<TakeawayOrder[]>({
    queryKey: ["tables", "takeaway"],
    queryFn: () => apiFetch<TakeawayOrder[]>("/api/tables/takeaway"),
    refetchInterval: 20000,
  });
}

export function useVoidTakeaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tables/takeaway/${id}/void`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables", "takeaway"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// --- Table History ---

export function useTableHistory(tableId: string | null, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery({
    queryKey: ["tables", tableId, "history", from, to],
    queryFn: () => apiFetch(`/api/tables/${tableId}/history${qs ? `?${qs}` : ""}`),
    enabled: !!tableId,
  });
}

// --- Table Assignments ---

export function useTableAssignments(tableId: string | null) {
  return useQuery({
    queryKey: ["tables", tableId, "assignments"],
    queryFn: () => apiFetch(`/api/tables/${tableId}/assignments`),
    enabled: !!tableId,
  });
}

export function useAssignWaiter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, userId }: { tableId: string; userId: string }) =>
      apiFetch(`/api/tables/${tableId}/assignments`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, userId }: { tableId: string; userId: string }) =>
      apiFetch(`/api/tables/${tableId}/assignments/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

export function useMyAssignedTables() {
  return useQuery({
    queryKey: ["tables", "my-assignments"],
    queryFn: () => apiFetch<{ table_id: string; table_number: number }[]>("/api/tables/my-assignments"),
  });
}

export function useTableActiveSession(tableId: string | null) {
  return useQuery({
    queryKey: ["tables", tableId, "active-session"],
    queryFn: () => apiFetch<{ session: any; orders: any[] }>(`/api/tables/${tableId}/active-session`),
    enabled: !!tableId,
    ...LIVE_QUERY,
  });
}

function invalidateTableOperations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tables"] });
  qc.invalidateQueries({ queryKey: ["sessions"] });
}

export function useTransferTableSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, targetTableId }: { sessionId: string; targetTableId: string }) =>
      apiFetch(`/api/tables/sessions/${sessionId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ targetTableId }),
      }),
    onSuccess: () => invalidateTableOperations(qc),
  });
}

export function useMergeTableSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetSessionId,
      sourceSessionIds,
    }: {
      targetSessionId: string;
      sourceSessionIds: string[];
    }) =>
      apiFetch("/api/tables/sessions/merge", {
        method: "POST",
        body: JSON.stringify({ targetSessionId, sourceSessionIds }),
      }),
    onSuccess: () => invalidateTableOperations(qc),
  });
}

export function useSplitTableSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      targetTableId,
      items,
    }: {
      sessionId: string;
      targetTableId: string;
      items: Array<{ orderItemId: string; quantity: number }>;
    }) =>
      apiFetch(`/api/tables/sessions/${sessionId}/split`, {
        method: "POST",
        body: JSON.stringify({ targetTableId, items }),
      }),
    onSuccess: () => invalidateTableOperations(qc),
  });
}
