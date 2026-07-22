/**
 * Nguồn duy nhất cho việc điều hướng theo vai trò.
 * Chỉ quản lý trở lên mới vào được trang Tổng quan (/dashboard); nhân viên vận hành
 * (thu ngân, phục vụ) vào thẳng màn Bàn ăn — quán chạy table-first; bếp vào KDS.
 */
export const MANAGER_ROLES = ["super_admin", "org_admin", "branch_manager"];

export function isManagerRole(role?: string): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}

export function landingPathForRole(role?: string): string {
  if (isManagerRole(role)) return "/dashboard";
  if (role === "kitchen") return "/kitchen";
  return "/tables";
}
