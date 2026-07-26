import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  branches: string[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  selectedBranchId: string | null;
  /**
   * Mốc bắt đầu phiên trên máy này (epoch ms). Điện thoại nhân viên hết 8 tiếng
   * là tự văng ra — xem `session-expiry-provider.tsx`. Đặt lúc đăng nhập và
   * ĐẶT LẠI mỗi lần kết nối trạm (quét QR / chọn chi nhánh) = vào ca mới.
   */
  sessionStartedAt: number | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setAccessToken: (token: string) => void;
  setSelectedBranch: (branchId: string) => void;
  /** Gia hạn phiên: gọi khi nhân viên kết nối lại với trạm lúc vào ca. */
  renewSession: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      selectedBranchId: null,
      sessionStartedAt: null,
      setAuth: (user, accessToken, refreshToken) => {
        const branchId = user.branches?.[0] || null;
        set({ user, accessToken, refreshToken, selectedBranchId: branchId, sessionStartedAt: Date.now() });
        if (typeof window !== "undefined") {
          localStorage.setItem("access_token", accessToken);
          localStorage.setItem("refresh_token", refreshToken);
          if (branchId) localStorage.setItem("selected_branch_id", branchId);
        }
      },
      setAccessToken: (accessToken) => {
        set({ accessToken });
        if (typeof window !== "undefined") {
          localStorage.setItem("access_token", accessToken);
        }
      },
      setSelectedBranch: (branchId) => {
        set({ selectedBranchId: branchId });
        if (typeof window !== "undefined") {
          localStorage.setItem("selected_branch_id", branchId);
        }
      },
      renewSession: () => set({ sessionStartedAt: Date.now() }),
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null, selectedBranchId: null, sessionStartedAt: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("selected_branch_id");
        }
      },
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: "restai-auth" }
  )
);
