/**
 * Ngày theo GIỜ VIỆT NAM (+7), dạng 'YYYY-MM-DD'.
 *
 * ⚠️ Đừng dùng `new Date().toISOString().split("T")[0]`: đó là ngày UTC. Từ 0h đến
 * 7h sáng giờ VN — đúng giờ quán mở cửa — nó vẫn ra NGÀY HÔM QUA, nên bấm "Hôm nay"
 * lúc 6h30 lại xem số của hôm qua. Máy chủ lọc theo ngày VN, nên phía máy bấm cũng
 * phải tính ngày VN thì hai bên mới khớp.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function vnToday(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Cộng/trừ ngày trên chuỗi 'YYYY-MM-DD' (tính thuần lịch, không dính múi giờ máy). */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Cộng/trừ tháng; ngày 31 sang tháng ngắn thì lùi về cuối tháng đó. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function vnMonthStart(): string {
  return `${vnToday().slice(0, 8)}01`;
}

/** Số ngày của khoảng [start, end], tính cả hai đầu. */
export function daysInRange(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}

/** '2026-11-27' → '27/11/2026'. */
export function formatVnDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
