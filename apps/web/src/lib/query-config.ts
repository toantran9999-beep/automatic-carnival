/**
 * Chính sách bộ nhớ đệm dùng chung cho toàn app.
 *
 * Chia dữ liệu làm 2 nhóm theo tốc độ đổi — không có một con số đúng cho mọi thứ:
 *
 * - `STATIC_QUERY` — thực đơn, danh mục, nhóm tuỳ chọn, cài đặt: đổi vài lần một tuần.
 *   Giữ lâu, hiện ngay bản cũ rồi làm mới ngầm. An toàn vì máy chủ phát `menu:updated`
 *   qua WebSocket ngay khi có sửa (xem `components/cache-sync-provider.tsx`), nên bản
 *   cũ không sống quá vài giây — chứ KHÔNG phải vì đoán 5 phút là đủ.
 *
 * - `LIVE_QUERY` — bàn, phiên bàn, đơn, ca làm: luôn coi là cũ, lần nào vào cũng gọi
 *   lại; vẫn giữ trong bộ nhớ để vẽ ngay bản trước rồi thay bằng bản mới.
 */

export const STATIC_QUERY = {
  staleTime: 5 * 60_000,
  gcTime: 24 * 60 * 60_000,
} as const;

export const LIVE_QUERY = {
  staleTime: 0,
  gcTime: 60 * 60_000,
} as const;

/**
 * ⚠️ TĂNG số này khi ĐỔI CẤU TRÚC dữ liệu API (đổi tên trường, đổi kiểu…).
 * Cache đã lưu trên máy khách sẽ tự bị bỏ, tránh app đọc nhầm bản cũ không còn khớp.
 */
export const CACHE_VERSION = "v1";

/** Khoá lưu cache trong localStorage. */
export const CACHE_STORAGE_KEY = "toda-query-cache";

/** Cache lưu trên máy quá hạn này thì bỏ (máy POS tắt qua đêm). */
export const CACHE_MAX_AGE = 24 * 60 * 60_000;

/**
 * Chỉ những nhóm này được ghi xuống localStorage.
 *
 * ⚠️ CỐ Ý KHÔNG có `settings`: cài đặt chi nhánh chứa số tài khoản ngân hàng và khoá
 * webhook — không ghi xuống bộ nhớ trình duyệt của máy quầy. Cũng không lưu dữ liệu
 * sống (đơn/bàn/ca) vì lưu lại chỉ tổ hiện số cũ.
 */
export const PERSISTED_QUERY_ROOTS = ["menu", "best-sellers"];

export function isPersistedQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && PERSISTED_QUERY_ROOTS.includes(key[0]);
}
