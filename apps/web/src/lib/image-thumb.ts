/** Suy URL thumbnail (~320px) từ URL ảnh gốc: abc.jpg -> abc.thumb.jpg (giữ nguyên đuôi). */
export function toThumbUrl(url: string): string {
  const dot = url.lastIndexOf(".");
  const slash = url.lastIndexOf("/");
  if (dot <= slash) return url;
  return `${url.slice(0, dot)}.thumb${url.slice(dot)}`;
}
