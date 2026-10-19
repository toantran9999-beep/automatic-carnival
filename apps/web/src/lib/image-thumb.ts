/**
 * Suy URL thumbnail (~320px) từ URL ảnh gốc: abc.webp -> abc.thumb.webp (giữ nguyên đuôi).
 *
 * ⚠️ CHỈ với ảnh của mình (`/uploads/…`) — chỉ chỗ đó mới có bản `.thumb` (sinh
 * lúc upload, xem `storeUpload`). Trước đây hàm đổi MỌI url, nên với ảnh SVG và
 * ảnh máy chủ ngoài, mỗi ô món đều gọi một lượt `.thumb` ăn 404 rồi mới tải ảnh
 * gốc — 49 lượt 404 mỗi lần vào trang thực đơn (đo 19/10/2026).
 */
export function toThumbUrl(url: string): string {
  if (!url.includes("/uploads/") || /\.svg(\?|$)/i.test(url)) return url;
  const dot = url.lastIndexOf(".");
  const slash = url.lastIndexOf("/");
  if (dot <= slash) return url;
  return `${url.slice(0, dot)}.thumb${url.slice(dot)}`;
}
