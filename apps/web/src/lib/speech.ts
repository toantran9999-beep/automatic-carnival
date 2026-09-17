"use client";

import { apiFetchBlob } from "@/lib/fetcher";

/**
 * Đọc phiếu bằng loa trạm quầy — song song với lúc máy in đang nhả giấy.
 *
 * Tiếng nói là LỚP PHỤ TRỢ: máy in vẫn là đường chính và tiếng "ting" của
 * `beep.ts` vẫn là dấu hiệu chính. Mọi thứ trong file này hỏng thì quầy phải
 * chạy y như hôm chưa có nó — không ném lỗi ra ngoài, không chặn việc in.
 *
 * Đo thật trên VPS (VieNeu-TTS Nano, 16 bước): câu ngắn 1,7 s · câu đầy đủ một
 * phiếu 3 món 2,8 s. Service xử lý TUẦN TỰ nên dồn đơn là xếp hàng — vì vậy ở
 * đây có hàng đợi riêng, tự rút gọn và tự bỏ phiếu quá cũ.
 */

export type SpeechMode = "off" | "short" | "full";

/** Món nào đọc ra nghe kỳ thì thêm vào đây. Không có trong bảng thì để nguyên. */
const SPEECH_ALIASES: Array<[RegExp, string]> = [
  [/\bsize\s*s\b/gi, "cỡ nhỏ"],
  [/\bsize\s*m\b/gi, "cỡ vừa"],
  [/\bsize\s*l\b/gi, "cỡ lớn"],
  [/\bespresso\b/gi, "ét pờ rét sô"],
  [/\bcappuccino\b/gi, "ca pu chi nô"],
  [/\blatte\b/gi, "la tê"],
  [/\bmatcha\b/gi, "mát cha"],
  [/\bcacao\b/gi, "ca cao"],
  [/\bsoda\b/gi, "xô đa"],
  [/\btopping\b/gi, "thêm"],
  // Tùy chọn "gõ số" ghép thẳng đơn vị vào tên ("Đường 13g", "Sữa 30ml").
  [/(\d)\s*ml\b/gi, "$1 mi li lít"],
  [/(\d)\s*g\b/gi, "$1 gam"],
];

const DON_VI = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Đọc số 0–999 thành chữ. Đủ cho số phiếu, số bàn và số lượng ly. */
function docSo(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n > 999) return String(n);
  if (n < 10) return DON_VI[n];
  if (n < 100) {
    const chuc = Math.floor(n / 10);
    const dv = n % 10;
    const dau = chuc === 1 ? "mười" : `${DON_VI[chuc]} mươi`;
    if (dv === 0) return dau;
    if (dv === 1 && chuc > 1) return `${dau} mốt`;
    if (dv === 4 && chuc > 1) return `${dau} tư`;
    if (dv === 5) return `${dau} lăm`;
    return `${dau} ${DON_VI[dv]}`;
  }
  const tram = Math.floor(n / 100);
  const con = n % 100;
  if (con === 0) return `${DON_VI[tram]} trăm`;
  if (con < 10) return `${DON_VI[tram]} trăm lẻ ${DON_VI[con]}`;
  return `${DON_VI[tram]} trăm ${docSo(con)}`;
}

/**
 * Dọn câu cho vừa khóa cổ của máy chủ (`ALLOWED_TEXT` trong routes/tts.ts).
 * Gửi ký tự lạ là bị trả 400 và cả câu im luôn.
 */
function sanitize(text: string): string {
  let out = text;
  for (const [re, rep] of SPEECH_ALIASES) out = out.replace(re, rep);
  out = out
    .replace(/[^\p{L}\p{N} .,:;!?%/()+-]/gu, " ")
    // Số còn sót (thường từ tên tùy chọn gõ tay) cũng đọc thành chữ, để không
    // phải đoán xem service đọc "13" ra "mười ba" hay "một ba".
    .replace(/\d+/g, (m) => {
      const n = Number(m);
      return n <= 999 ? docSo(n) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return out.slice(0, 300);
}

/** "01" / "27" → "hai mươi bảy"; mã không phải số thì đọc nguyên. */
export function docSoPhieu(orderNumber: string): string {
  const digits = String(orderNumber ?? "").replace(/\D/g, "");
  if (!digits) return String(orderNumber ?? "");
  const n = Number(digits);
  return Number.isFinite(n) ? docSo(n) : digits;
}

export interface SpeechOrderLike {
  /** Chỉ còn dùng cho câu báo lỗi/thanh toán — câu đọc phiếu KHÔNG đọc số nữa. */
  orderNumber?: string;
  tableNumber?: number | null;
  addOnId?: string | null;
  items?: Array<{
    name: string;
    quantity: number;
    modifiers?: string[] | null;
    notes?: string | null;
  }> | null;
}

/**
 * Dựng câu đọc cho một phiếu đặt món. `off` hoặc thiếu dữ liệu → null.
 *
 * ⚠️ CỐ Ý KHÔNG đọc số phiếu (chủ quán chốt 17/09/2026): người pha cần biết
 * **pha gì, cho bàn nào**, còn số phiếu thì đã nằm trên tờ giấy vừa in — đọc
 * thêm chỉ làm câu dài ra và loãng phần quan trọng. Số phiếu chỉ còn xuất hiện
 * ở câu báo LỖI và câu báo đã thanh toán, vì hai chỗ đó là để tra cứu.
 */
export function buildOrderSpeech(p: SpeechOrderLike, mode: SpeechMode): string | null {
  if (mode === "off") return null;

  const dau = p.addOnId ? "Thêm món. " : "";
  const cho = p.tableNumber != null ? `Bàn ${docSo(p.tableNumber)}` : "Mang về";
  const head = `${dau}${cho}.`;
  if (mode === "short") return sanitize(head);

  const items = (p.items ?? []).map((i) => {
    const sl = docSo(i.quantity ?? 1);
    const mods = (i.modifiers ?? []).filter(Boolean).join(", ");
    const notes = (i.notes ?? "").trim();
    return [`${sl} ${i.name}`, mods, notes].filter(Boolean).join(", ");
  });

  return sanitize(items.length ? `${head} ${items.join(". ")}.` : head);
}

// ---------------------------------------------------------------------------
// Hàng đợi phát
// ---------------------------------------------------------------------------

interface QueueItem {
  text: string;
  at: number;
}

const queue: QueueItem[] = [];
let playing = false;
let audioEl: HTMLAudioElement | null = null;
/** Giọng đang dùng — nơi gọi truyền vào, mặc định giọng nữ miền Nam của service. */
let currentVoice = "nu";

/** Phiếu chờ quá lâu thì đọc chỉ gây rối: giấy đã ra từ đời nào rồi. */
const MAX_AGE_MS = 90_000;
/** Quá số này thì phần dư gộp thành một câu tóm tắt. */
const MAX_QUEUE = 5;

export function setSpeechVoice(voice: string) {
  currentVoice = voice || "nu";
}

/** Số phiếu đang chờ đọc — nơi gọi dùng nó để tự rút gọn câu lúc dồn đơn. */
export function speechQueueLength(): number {
  return queue.length + (playing ? 1 : 0);
}

/**
 * Mở khóa phát tiếng bằng một cú bấm của người dùng.
 *
 * APK quầy đã tắt yêu cầu này (`setMediaPlaybackRequiresUserGesture(false)`),
 * nhưng Chrome thường trên máy khác thì chặn — gọi khi bật công tắc Trạm quầy.
 */
export function primeAudio() {
  try {
    if (!audioEl) audioEl = new Audio();
    audioEl.muted = true;
    void audioEl.play().catch(() => {});
    audioEl.pause();
    audioEl.muted = false;
  } catch {
    // Không mở khóa được thì lần đọc đầu im — không phải lỗi đáng báo.
  }
}

async function playNext() {
  if (playing) return;
  const now = Date.now();
  while (queue.length && now - queue[0].at > MAX_AGE_MS) queue.shift();
  const item = queue.shift();
  if (!item) return;

  playing = true;
  let url: string | null = null;
  try {
    const blob = await apiFetchBlob("/api/tts/speak", {
      method: "POST",
      body: JSON.stringify({ text: item.text, voice: currentVoice }),
    });
    url = URL.createObjectURL(blob);
    if (!audioEl) audioEl = new Audio();
    audioEl.src = url;
    await new Promise<void>((resolve) => {
      if (!audioEl) return resolve();
      const done = () => {
        audioEl?.removeEventListener("ended", done);
        audioEl?.removeEventListener("error", done);
        resolve();
      };
      audioEl.addEventListener("ended", done);
      audioEl.addEventListener("error", done);
      void audioEl.play().catch(() => done());
    });
  } catch {
    // Service đọc hỏng / mất mạng: bỏ câu này, quầy vẫn in và vẫn kêu chuông.
  } finally {
    if (url) URL.revokeObjectURL(url);
    playing = false;
    if (queue.length) void playNext();
  }
}

/** Xếp một câu vào hàng đợi đọc. Không bao giờ ném lỗi ra ngoài. */
export function speak(text: string | null | undefined) {
  const clean = sanitize(String(text ?? ""));
  if (!clean) return;
  queue.push({ text: clean, at: Date.now() });

  // Dồn quá nhiều thì đọc hết cũng không ai theo kịp — giữ vài phiếu đầu rồi
  // gộp phần dư thành một câu, hơn là đọc lải nhải mấy chục giây.
  if (queue.length > MAX_QUEUE) {
    const du = queue.splice(MAX_QUEUE - 1);
    queue.push({ text: sanitize(`Còn ${docSo(du.length)} phiếu nữa.`), at: Date.now() });
  }

  void playNext();
}
