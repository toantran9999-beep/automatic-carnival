import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { AppEnv } from "../types.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";

/**
 * Đọc phiếu bằng giọng nói — cầu nối sang service TTS tự host trên VPS
 * (`read_book_tts`, VieNeu-TTS Nano, cùng network `toda-pos_default`).
 *
 * ⚠️ Đây là route DUY NHẤT trả nhị phân thay vì vỏ `{success,data}` của mục 1
 * CONVENTIONS: trình duyệt cần đúng một khối WAV để phát. Lỗi thì vẫn trả vỏ JSON
 * như bình thường.
 *
 * Tiếng nói chỉ là lớp phụ trợ cho loa quầy — máy in vẫn là đường chính. Hỏng ở
 * đây tuyệt đối không được làm hỏng việc in, nên mọi lỗi đều trả 503 gọn gàng.
 */

const TTS_URL = process.env.TTS_URL || "http://read_book_tts:8080";
/** Đọc một phiếu dài nhất cũng chưa tới 200 ký tự; cho dư một chút rồi chặn cứng. */
const MAX_TEXT = 300;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Chỉ cho chữ, số và vài dấu câu.
 *
 * ⚠️ Đây là khóa cổ, không phải chuyện thẩm mỹ: không có nó thì bất kỳ tài khoản
 * nhân viên nào cũng biến endpoint này thành dịch vụ đọc sách miễn phí chạy trên
 * đúng 2 nhân CPU mà cả quán đang dùng để bán hàng.
 */
const ALLOWED_TEXT = /^[\p{L}\p{N} .,:;!?%/()+-]+$/u;

interface CacheEntry {
  body: Uint8Array;
  at: number;
}
/** Câu cố định ("đã thanh toán", "lỗi in phiếu") và phiếu in lại về 0 giây. */
const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheGet(key: string): Uint8Array | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Chạm vào là đẩy xuống cuối — Map giữ thứ tự chèn nên đây là LRU rẻ nhất.
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: Uint8Array) {
  cache.set(key, { body, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Danh sách giọng đổi rất hiếm — giữ một giờ, khỏi đánh thức service mỗi lần mở Cài đặt. */
let voicesCache: { at: number; data: unknown } | null = null;
const VOICES_TTL_MS = 60 * 60 * 1000;

async function callTts(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${TTS_URL}${path}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const tts = new Hono<AppEnv>();
tts.use("*", authMiddleware, tenantMiddleware);
// Ai đọc được đơn thì nghe được đơn — trạm quầy chạy bằng tài khoản thu ngân.
tts.use("*", requirePermission("orders:read"));

// GET /voices — danh sách giọng để chọn trong Cài đặt → Thiết bị này.
tts.get("/voices", async (c) => {
  if (voicesCache && Date.now() - voicesCache.at < VOICES_TTL_MS) {
    return c.json({ success: true, data: voicesCache.data });
  }
  try {
    const res = await callTts("/voices");
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const data = await res.json();
    voicesCache = { at: Date.now(), data };
    return c.json({ success: true, data });
  } catch {
    // Không có giọng thì Cài đặt hiện danh sách rỗng và dùng giọng mặc định —
    // không phải lỗi đáng báo động.
    return c.json({ success: true, data: [] });
  }
});

// POST /speak — {text, voice} → WAV 24 kHz.
tts.post("/speak", async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : "nu";

  if (!rawText || rawText.length > MAX_TEXT || !ALLOWED_TEXT.test(rawText)) {
    return c.json(
      { success: false, error: { code: "INVALID_TEXT", message: "Câu đọc không hợp lệ" } },
      400,
    );
  }

  const key = createHash("sha1").update(`${voice}|${rawText}`).digest("hex");
  const cached = cacheGet(key);
  if (cached) {
    return new Response(cached as unknown as BodyInit, {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600", "X-Tts-Cache": "hit" },
    });
  }

  // Hai nút mặc định của service là `voice: nu|nam`; chọn giọng cụ thể thì đi
  // bằng `voice_name`. Gửi nhầm khóa là service lặng lẽ dùng giọng mặc định.
  const payload =
    voice === "nu" || voice === "nam" ? { text: rawText, voice } : { text: rawText, voice_name: voice };

  try {
    const res = await callTts("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.byteLength) throw new Error("TTS rỗng");
    cacheSet(key, buf);
    return new Response(buf as unknown as BodyInit, {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600", "X-Tts-Cache": "miss" },
    });
  } catch {
    // Im lặng có chủ ý: service đọc hỏng thì quầy vẫn in, vẫn kêu chuông như cũ.
    return c.json(
      { success: false, error: { code: "TTS_UNAVAILABLE", message: "Không gọi được dịch vụ đọc" } },
      503,
    );
  }
});

export { tts };
