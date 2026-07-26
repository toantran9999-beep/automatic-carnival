import { createMiddleware } from "hono/factory";
import { PERMISSIONS } from "@restai/config";
import type { AppEnv } from "../types.js";

export function requirePermission(permission: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user") as any;
    if (!user) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } },
        401,
      );
    }

    const userPermissions =
      PERMISSIONS[user.role as keyof typeof PERMISSIONS] as readonly string[] | undefined;
    if (!userPermissions) {
      return c.json(
        { success: false, error: { code: "FORBIDDEN", message: "Rol no válido" } },
        403,
      );
    }

    // Super admin has all permissions
    if (userPermissions.includes("*")) return next();

    // Check exact match or wildcard (e.g., "menu:*" matches "menu:read")
    const [resource] = permission.split(":");
    const hasPermission = userPermissions.some((p) => {
      if (p === permission) return true;
      if (p === `${resource}:*`) return true;
      return false;
    });

    if (!hasPermission) {
      return c.json(
        { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } },
        403,
      );
    }

    return next();
  });
}

/** Vai trò quản trị — xem được hết, nhưng KHÔNG chạm dữ liệu đang bán hàng. */
const MANAGER_ROLES = ["super_admin", "org_admin", "branch_manager"];

/**
 * Chặn admin/quản lý đụng vào DỮ LIỆU ĐANG CHẢY: order, thanh toán, mở/đóng ca,
 * mở/huỷ/gộp/tách/chuyển bàn. Mọi thao tác bán hàng phải xuất phát từ tài khoản
 * chi nhánh (vai trò Thu ngân) đăng nhập tại quầy, để sổ sách quy về một mối.
 *
 * ⚠️ CỐ Ý không sửa bảng `PERMISSIONS`: quản lý vẫn giữ nguyên `orders:*`,
 * `tables:*`, `payments:*` cho các trang quản trị và báo cáo. Chặn ở đây là chặn
 * THEO TỪNG ĐƯỜNG DẪN, vì cắt ở tầng quyền sẽ cắt nhầm — ví dụ `PATCH /tables/:id`
 * (đổi tên bàn, việc setup, vẫn cho) và `PATCH /tables/:id/status` (đổi trạng thái
 * bàn, dữ liệu đang chảy, phải chặn) dùng CHUNG quyền `tables:update`.
 *
 * ⚠️ KHÔNG có cửa thoát hiểm cho super_admin — chủ quán đã chọn vậy. Cần sửa sai
 * thì đăng nhập tài khoản chi nhánh.
 */
export const blockLiveOps = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user") as any;
  if (user && MANAGER_ROLES.includes(user.role)) {
    return c.json(
      {
        success: false,
        error: {
          code: "MANAGER_READ_ONLY",
          message:
            "Tài khoản quản lý chỉ xem. Thao tác bán hàng phải dùng tài khoản chi nhánh đăng nhập tại quầy.",
        },
      },
      403,
    );
  }
  return next();
});

// Convenience helpers
export const requireAdmin = () => requirePermission("org:read");
export const requireManager = () => requirePermission("branch:read");
