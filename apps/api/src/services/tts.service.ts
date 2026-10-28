import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * Tiếng cho loa trạm quầy — đọc NGUYÊN CÂU, có bộ nhớ đệm trên đĩa.
 *
 * ⚠️ Đã thử ghép từ mảnh làm sẵn (cắt ở dấu phẩy/chấm rồi nối lại, 27/10/2026):
 * ra tiếng tức thì nhưng nghe rời rạc. Chủ quán nghe so sánh và chốt bản đọc
 * liền dù phải chờ 1–3 s — rõ chữ và tự nhiên hơn. Đừng quay lại ghép mảnh.
 *
 * Câu phiếu vẫn lặp lại nhiều ("Mang về. một Cà phê sữa đá."), nên câu nào đã
 * đọc một lần thì lưu đĩa để lần sau phát ngay; script `tts-prewarm` làm sẵn
 * những câu hay gặp nhất.
 *
 * Hỏng ở bất cứ đâu trong file này cũng chỉ làm loa im — không bao giờ chạm tới
 * đường in.
 */

const TTS_URL = process.env.TTS_URL || "http://read_book_tts:8080";
/** Thư mục lưu tiếng — gắn volume trong docker-compose để deploy không xoá. */
const CACHE_DIR = process.env.TTS_CACHE_DIR || "/app/tts-cache";
/** Đổi cách đọc (giọng mặc định, tốc độ…) thì tăng số này để bỏ hết tiếng cũ. */
const CACHE_VERSION = "v1";
const REQUEST_TIMEOUT_MS = 15_000;
/** Một câu ~100–300 KB; 5.000 file ≈ 1 GB là trần, quá thì thôi ghi. */
const MAX_DISK_FILES = 5_000;

const mem = new Map<string, Uint8Array>();
const MEM_MAX = 200;
let diskReady: Promise<boolean> | null = null;
let diskFiles = 0;

function ensureDisk(): Promise<boolean> {
  if (!diskReady) {
    diskReady = (async () => {
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        diskFiles = (await readdir(CACHE_DIR)).length;
        return true;
      } catch {
        // Không ghi được đĩa thì vẫn chạy bằng RAM — chỉ mất tác dụng sau khi khởi động lại.
        return false;
      }
    })();
  }
  return diskReady;
}

function memGet(key: string) {
  const hit = mem.get(key);
  if (!hit) return null;
  mem.delete(key); // Map giữ thứ tự chèn → chạm vào là đẩy xuống cuối = LRU rẻ nhất
  mem.set(key, hit);
  return hit;
}

function memSet(key: string, v: Uint8Array) {
  mem.set(key, v);
  while (mem.size > MEM_MAX) {
    const oldest = mem.keys().next().value;
    if (oldest === undefined) break;
    mem.delete(oldest);
  }
}

function cacheKey(voice: string, text: string) {
  return createHash("sha1").update(`${CACHE_VERSION}|${voice}|${text}`).digest("hex");
}

/**
 * Gọi service xếp hàng MỘT-MỘT. Service vốn khoá tuần tự (2 nhân CPU), bắn
 * song song chỉ làm mọi câu cùng chậm và chiếm hàng của đọc sách.
 */
let synthChain: Promise<unknown> = Promise.resolve();

export async function synthesize(text: string, voice: string): Promise<Uint8Array> {
  const run = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      // Hai nút mặc định của service là `voice: nu|nam`; chọn giọng cụ thể thì đi
      // bằng `voice_name`. Gửi nhầm khóa là service lặng lẽ dùng giọng mặc định.
      const payload = voice === "nu" || voice === "nam" ? { text, voice } : { text, voice_name: voice };
      const res = await fetch(`${TTS_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!buf.byteLength) throw new Error("TTS rỗng");
      return buf;
    } finally {
      clearTimeout(timer);
    }
  };
  const p = synthChain.then(run, run);
  synthChain = p.catch(() => {});
  return p;
}

/** Tiếng của cả câu: RAM → đĩa → gọi service. `hit` = có sẵn, không phải chờ tổng hợp. */
export async function getSpeech(text: string, voice: string): Promise<{ wav: Uint8Array; hit: boolean }> {
  const key = cacheKey(voice, text);
  const inMem = memGet(key);
  if (inMem) return { wav: inMem, hit: true };

  const disk = await ensureDisk();
  const file = join(CACHE_DIR, `${key}.wav`);
  if (disk) {
    try {
      const buf = new Uint8Array(await readFile(file));
      memSet(key, buf);
      return { wav: buf, hit: true };
    } catch {
      // chưa có trên đĩa
    }
  }

  const wav = await synthesize(text, voice);
  memSet(key, wav);
  if (disk && diskFiles < MAX_DISK_FILES) {
    // Ghi ra file tạm rồi đổi tên: hai yêu cầu trùng câu cùng lúc không đọc phải file dở.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tmp, wav);
      await rename(tmp, file);
      diskFiles++;
    } catch {
      // Đầy đĩa / hết quyền: vẫn trả tiếng, chỉ là lần sau phải làm lại.
    }
  }
  return { wav, hit: false };
}
