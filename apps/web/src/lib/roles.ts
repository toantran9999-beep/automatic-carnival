/**
 * Nguồn duy nhất cho việc điều hướng theo vai trò.
 * Chỉ quản lý trở lên mới vào được trang Tổng quan (/dashboard); nhân viên vận hành
 * (thu ngân, phục vụ) vào thẳng màn Bàn ăn — quán chạy table-first; bếp vào KDS.
 */
export const MANAGER_ROLES = ["super_admin", "org_admin", "branch_manager"];

export function isManagerRole(role?: string): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}

/**
 * Được phép đụng DỮ LIỆU ĐANG BÁN HÀNG hay không: order, thanh toán, mở/đóng ca,
 * mở/huỷ/gộp/tách/chuyển bàn.
 *
 * Quản lý & admin CHỈ XEM — thao tác bán hàng phải làm từ tài khoản chi nhánh
 * (vai trò Thu ngân) đăng nhập tại quầy, để mọi việc quy về một mối.
 *
 * ⚠️ Đừng lẫn với `isManagerRole`/`canManageTables`: mấy cái đó là "quản lý MỚI
 * được" (thêm bàn, sửa khu vực, xem báo cáo); cái này NGƯỢC DẤU — quản lý KHÔNG
 * được. Máy chủ chặn thật bằng `blockLiveOps`, đây chỉ để khỏi bấm rồi ăn lỗi 403.
 */
export function canTouchLiveOps(role?: string): boolean {
  return !isManagerRole(role);
}

export function landingPathForRole(role?: string): string {
  if (isManagerRole(role)) return "/dashboard";
  if (role === "kitchen") return "/kitchen";
  return "/tables";
}
