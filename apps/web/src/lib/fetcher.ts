import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let refreshPromise: Promise<string | null> | null = null;

type ApiFetchOptions = RequestInit & {
  includeBranchHeader?: boolean;
};

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAccessToken, logout } = useAuthStore.getState();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (json.success && json.data.accessToken) {
      setAccessToken(json.data.accessToken);
      return json.data.accessToken;
    }
    logout();
    return null;
  } catch {
    logout();
    return null;
  }
}

export async function apiFetch<T = any>(path: string, options?: ApiFetchOptions): Promise<T> {
  const { accessToken, selectedBranchId } = useAuthStore.getState();
  const {
    includeBranchHeader = true,
    headers: customHeaders,
    ...requestOptions
  } = options ?? {};

  const makeRequest = async (token: string | null) => {
    return fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(includeBranchHeader && selectedBranchId
          ? { "x-branch-id": selectedBranchId }
          : {}),
        ...customHeaders,
      },
    });
  };

  let res = await makeRequest(accessToken);

  // If 401, try to refresh the token once
  if (res.status === 401 && accessToken) {
    // Deduplicate concurrent refresh calls
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      res = await makeRequest(newToken);
    }
  }

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.success) {
    const message =
      json?.error?.message ||
      json?.message ||
      text ||
      `Lỗi API ${res.status}`;
    throw new Error(message);
  }
  return json.data as T;
}

/**
 * Như `apiFetch` nhưng trả về khối nhị phân (dùng cho WAV của loa đọc phiếu).
 *
 * Vẫn đi qua đúng đường token + tự làm mới phiên như `apiFetch` — tự `fetch` tay
 * là mất hết những thứ đó (mục 4 CONVENTIONS).
 */
export async function apiFetchBlob(path: string, options?: ApiFetchOptions): Promise<Blob> {
  const { accessToken, selectedBranchId } = useAuthStore.getState();
  const {
    includeBranchHeader = true,
    headers: customHeaders,
    ...requestOptions
  } = options ?? {};

  const makeRequest = async (token: string | null) => {
    return fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(includeBranchHeader && selectedBranchId
          ? { "x-branch-id": selectedBranchId }
          : {}),
        ...customHeaders,
      },
    });
  };

  let res = await makeRequest(accessToken);

  if (res.status === 401 && accessToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) res = await makeRequest(newToken);
  }

  if (!res.ok) throw new Error(`Lỗi API ${res.status}`);
  return res.blob();
}
