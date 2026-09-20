import { createMiddleware } from "hono/factory";
import { PERMISSIONS } from "@restai/config";
import type { AppEnv } from "../types.js";
import { verifyOrdersGateToken } from "../lib/jwt.js";
import { db, schema } from "@restai/db";
import { eq } from "drizzle-orm";

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

/**
 * Đòi VÉ MỞ KHOÁ trước khi cho đọc ĐƠN CŨ.
 *
 * ⚠️ Vì sao không cắt quyền `orders:read` cho gọn: quyền đó đang gánh cả
 * `GET /tables/takeaway`, `/orders/unprinted`, `/kitchen/orders`, `reprint`,
 * `print-ack`. Cắt là CHẾT POS. Nên chặn theo TỪNG ĐƯỜNG, cùng họ `blockLiveOps`.
 *
 * ⚠️ Và vì sao chặn ở máy chủ chứ không giấu tab: `GET /orders` trả nguyên cục
 * `getTableColumns(orders)`, giấu ở giao diện thì dữ liệu vẫn nằm sẵn trong bộ
 * nhớ trình duyệt — mở tab Network là đọc được.
 */
export const requireOrdersGate = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user") as any;

  // Quản lý trở lên miễn: mã là của họ, và họ vốn xem được Báo cáo.
  if (user && MANAGER_ROLES.includes(user.role)) return next();

  const refuse = () =>
    c.json(
      {
        success: false,
        error: {
          code: "ORDERS_GATE",
          message: "Cần mã mở khoá của chủ quán để xem đơn hàng.",
        },
      },
      403,
    );

  const tenant = c.get("tenant") as any;

  // CHƯA ĐẶT MÃ = TÍNH NĂNG NẰM IM. Không có nhánh này thì lúc vừa deploy, nhân
  // viên gặp ô nhập mã mà chủ quán còn chưa đặt mã nào — gõ gì cũng qua, chỉ tổ
  // dạy nhau rằng cái cửa này vô nghĩa.
  //
  // Đọc thêm một dòng `branches` mỗi lượt: chỉ chạy trên 3 đường bị khoá và chỉ
  // với nhân viên, tra theo khoá chính — rẻ hơn nhiều so với việc ôm một bộ nhớ
  // đệm rồi quên dọn khi chủ quán đổi mã.
  if (tenant?.branchId) {
    const [branch] = await db
      .select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    if (!(branch?.settings as any)?.orders_gate?.code_hash) return next();
  }

  const ticket = c.req.header("x-orders-gate");
  if (!ticket) return refuse();

  try {
    const payload = await verifyOrdersGateToken(ticket);
    // Vé của chi nhánh nào chỉ mở chi nhánh đó, và của người nào chỉ người đó
    // dùng — không đưa vé cho nhau được.
    if (payload.sub !== user?.sub) return refuse();
    if (tenant?.branchId && payload.branch !== tenant.branchId) return refuse();
  } catch {
    return refuse();
  }

  return next();
});

// Convenience helpers
export const requireAdmin = () => requirePermission("org:read");
export const requireManager = () => requirePermission("branch:read");
