import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Logo TODA — cây trong vòng tròn, dùng đúng file logo gốc của quán
 * (`/brand/mark.png`, sinh bởi `scripts/build-brand-assets.ps1`).
 *
 * Kiểu dáng nằm ở class `.brand-logo` trong `globals.css`: ảnh được dùng làm MẶT NẠ
 * rồi tô bằng `currentColor`, nên logo tự lấy màu chữ của chỗ đặt nó — than chì trên
 * nền sáng, kem trên nền tối, và không chỏi khi đổi màu nhấn ở phần Giao diện.
 *
 * ⚠️ KHÔNG đổi sang tiền tố `dark:` của Tailwind — dự án không khai báo
 * `@custom-variant dark`, nên `dark:` ăn theo cài đặt hệ điều hành chứ không theo
 * class `.dark` mà app tự bật.
 */
export function BrandLogo({ size = 40, className }: BrandLogoProps) {
  return (
    <span
      role="img"
      aria-label="TODA"
      className={cn("brand-logo inline-block", className)}
      style={{ width: size, height: size }}
    />
  );
}
