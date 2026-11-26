import { apiFetch } from "@/lib/fetcher";

/**
 * Đo thời gian thao tác NGAY TRÊN MÁY BẤM rồi gửi về máy chủ in ra log.
 *
 * Vì sao: 26/11/2026 máy quầy (APK) "mở bàn và thanh toán cực kỳ chậm", trong khi
 * log máy chủ cho thấy thanh toán chỉ ~40ms. Phần chậm nằm ở máy bấm — chỗ máy chủ
 * không nhìn thấy. Đọc kết quả: `docker compose logs api | grep "\[perf\]"`.
 *
 * Tạm thời: có kết luận thì gỡ cả file này lẫn routes/perf.ts.
 *
 * ⚠️ Mọi thứ ở đây phải "im lặng khi hỏng": đo hay gửi lỗi thì bỏ qua, tuyệt đối
 * không được chặn hay làm chậm thêm thao tác bán hàng.
 */

export type PerfName = "mo-ban" | "mo-thanh-toan" | "thu-tien";

interface Sample {
  name: PerfName;
  ms: number;
  longTasks: number;
  longMs: number;
}

/** Bỏ mốc treo quá lâu (bấm rồi bỏ đi chỗ khác) — số đó chỉ làm nhiễu. */
const MAX_OPEN_MS = 60_000;
const FLUSH_COUNT = 10;
const FLUSH_INTERVAL_MS = 60_000;

const starts = new Map<PerfName, number>();
const queue: Sample[] = [];
/** Các lần luồng giao diện bị khoá >50ms: [thời điểm bắt đầu, độ dài]. Giữ 2 phút gần nhất. */
const longTasks: Array<[number, number]> = [];
let observerStarted = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function ensureObserver() {
  if (observerStarted || typeof window === "undefined") return;
  observerStarted = true;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push([e.startTime, e.duration]);
      const cutoff = now() - 120_000;
      while (longTasks.length && longTasks[0][0] < cutoff) longTasks.shift();
    });
    po.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    // WebView cũ không có "longtask" — vẫn đo được thời gian, chỉ thiếu số lần khoá.
  }
}

/** Bắt đầu một mốc. Gọi lại lần nữa thì tính lại từ đầu (bấm lại). */
export function perfStart(name: PerfName) {
  try {
    ensureObserver();
    starts.set(name, now());
  } catch {
    /* im lặng */
  }
}

/** Kết thúc mốc (nếu đang mở) và xếp mẫu chờ gửi. */
export function perfEnd(name: PerfName) {
  try {
    const t0 = starts.get(name);
    if (t0 === undefined) return;
    starts.delete(name);
    const t1 = now();
    const ms = t1 - t0;
    if (ms < 0 || ms > MAX_OPEN_MS) return;

    let count = 0;
    let blocked = 0;
    for (const [s, d] of longTasks) {
      if (s + d < t0 || s > t1) continue;
      count++;
      blocked += d;
    }
    queue.push({ name, ms, longTasks: count, longMs: blocked });

    if (queue.length >= FLUSH_COUNT) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  } catch {
    /* im lặng */
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const samples = queue.splice(0, 20);
  if (samples.length === 0) return;
  apiFetch("/api/perf", { method: "POST", body: JSON.stringify({ samples }) }).catch(() => {});
}
