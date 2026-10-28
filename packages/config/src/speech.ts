/**
 * Dựng câu đọc phiếu cho loa trạm quầy — DÙNG CHUNG máy chủ và máy quầy.
 *
 * ⚠️ Phải nằm ở gói dùng chung, không được chép đôi: máy chủ làm sẵn tiếng các
 * câu hay gặp (script `tts-prewarm`) theo đúng chữ máy quầy sẽ gửi lên. Lệch một
 * chữ ("Bàn ba" với "bàn ba") là trật khoá bộ nhớ đệm, phiếu lại phải chờ tổng hợp.
 *
 * Toàn bộ là hàm thuần — không đụng DOM, không gọi mạng.
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
export function docSo(n: number): string {
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
export function sanitizeSpeech(text: string): string {
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

/**
 * Tên khách GIẢ do máy bấm đơn tự điền khi ô tên để trống.
 *
 * ⚠️ 4.890/4.890 đơn trong 30 ngày (đo 14/10/2026) mang đúng chữ này — nó không
 * phải tên ai cả. In hay đọc nó ra chỉ là tiếng ồn.
 */
const PLACEHOLDER_CUSTOMER_NAMES = new Set(["khách pos", "pos customer", "khach pos"]);

/** Tên khách thật hay chỉ là chữ mặc định? Trả về tên đã cắt khoảng trắng, hoặc null. */
export function realCustomerName(name: string | null | undefined): string | null {
  const t = String(name ?? "").trim();
  if (!t || PLACEHOLDER_CUSTOMER_NAMES.has(t.toLowerCase())) return null;
  return t;
}

export interface SpeechOrderLike {
  /** Chỉ còn dùng cho câu báo lỗi/thanh toán — câu đọc phiếu KHÔNG đọc số nữa. */
  orderNumber?: string;
  tableNumber?: number | null;
  addOnId?: string | null;
  /** Có = phiếu này là BẢN IN LẠI của đơn cũ, không phải đơn vừa gọi. */
  reprintToken?: string | null;
  /** Ô "Khách / ai lấy" của cả đơn. Chữ mặc định "Khách POS" tự bị bỏ. */
  customerName?: string | null;
  /** Ô ghi chú của CẢ ĐƠN (giao đâu…) — đọc một lần, không lặp theo từng món. */
  orderNotes?: string | null;
  items?: Array<{
    name: string;
    quantity: number;
    modifiers?: string[] | null;
    notes?: string | null;
  }> | null;
}

/**
 * Dựng câu đọc cho một phiếu đặt món. `off` → null.
 *
 * ⚠️ CỐ Ý KHÔNG đọc số phiếu (chủ quán chốt 17/09/2026): người pha cần biết
 * **pha gì, cho bàn nào**, còn số phiếu thì đã nằm trên tờ giấy vừa in — đọc
 * thêm chỉ làm câu dài ra và loãng phần quan trọng. Số phiếu chỉ còn xuất hiện
 * ở câu báo LỖI và câu báo đã thanh toán, vì hai chỗ đó là để tra cứu.
 */
export function buildOrderSpeech(p: SpeechOrderLike, mode: SpeechMode): string | null {
  if (mode === "off") return null;

  // ⚠️ Bản in lại phải được xướng rõ. Chiều 20/09/2026 có người chạm nhầm nút
  // in lại trên đơn hôm trước: loa đọc y hệt một đơn mới nên cả quán tưởng máy
  // tự đẻ đơn. Câu đọc phải nói đúng thứ đang cầm trên tay.
  const dau = p.reprintToken ? "In lại. " : p.addOnId ? "Thêm món. " : "";
  const cho = p.tableNumber != null ? `Bàn ${docSo(p.tableNumber)}` : "Mang về";
  // Ai lấy / giao đâu đọc MỘT lần ngay sau chỗ ngồi — trước đây nhân viên phải
  // gõ vào ghi chú từng món nên đơn hai món là nghe tên khách hai lần.
  const who = [realCustomerName(p.customerName), (p.orderNotes ?? "").trim()].filter(Boolean);
  const head = `${dau}${[cho, ...who].join(", ")}.`;
  if (mode === "short") return sanitizeSpeech(head);

  const items = (p.items ?? []).map((i) => {
    const sl = docSo(i.quantity ?? 1);
    const mods = (i.modifiers ?? []).filter(Boolean).join(", ");
    const notes = (i.notes ?? "").trim();
    return [`${sl} ${i.name}`, mods, notes].filter(Boolean).join(", ");
  });

  return sanitizeSpeech(items.length ? `${head} ${items.join(". ")}.` : head);
}
