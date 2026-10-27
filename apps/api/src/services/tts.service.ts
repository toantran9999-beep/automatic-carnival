import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { speechSegments, type SpeechSegment } from "@restai/config";

/**
 * Tiếng cho loa trạm quầy — ghép từ MẢNH đã làm sẵn.
 *
 * ⚠️ Vì sao không đọc nguyên câu như trước: giấy in ra 0,3 s sau khi có đơn, còn
 * tổng hợp nguyên câu mất 1–2 s (lúc service bận đọc sách là 5–7 s) — tiếng
 * luôn tới sau tờ phiếu. Mà câu phiếu lặp lại cực nhiều: 30 ngày chỉ có 106 cụm
 * món, 38 tùy chọn, 24 bàn (đo 14/10/2026). Làm tiếng từng mảnh MỘT lần rồi lưu
 * đĩa, phiếu thường không còn phải chờ tổng hợp giây nào.
 *
 * Hỏng ở bất cứ đâu trong file này cũng chỉ làm loa im — không bao giờ chạm tới
 * đường in.
 */

const TTS_URL = process.env.TTS_URL || "http://read_book_tts:8080";
/** Thư mục lưu mảnh tiếng — gắn volume trong docker-compose để deploy không xoá. */
const CACHE_DIR = process.env.TTS_CACHE_DIR || "/app/tts-cache";
/** Đổi cách đọc (bước, giọng mặc định…) thì tăng số này để bỏ hết mảnh cũ. */
const CACHE_VERSION = "v1";
const REQUEST_TIMEOUT_MS = 15_000;
/** Mảnh tiếng ~30–100 KB; 5.000 mảnh là dư cho cả thực đơn lẫn ghi chú vài tháng. */
const MAX_DISK_FILES = 5_000;

/** Khoảng lặng chèn khi ghép — dấu phẩy ngắn, dấu chấm dài hơn cho có nhịp. */
const PAUSE_MS = { comma: 120, period: 280 } as const;
/** Mẫu nhỏ hơn ngưỡng này coi là lặng — cắt bớt đầu/đuôi mỗi mảnh để nhịp đều. */
const SILENCE_THRESHOLD = 300;
const KEEP_EDGE_MS = 30;

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

interface ParsedWav extends WavFormat {
  pcm: Uint8Array;
}

/** Đọc WAV PCM thường. Định dạng lạ (nén, float…) trả null để lùi về đọc nguyên câu. */
export function parseWav(buf: Uint8Array): ParsedWav | null {
  if (buf.byteLength < 44) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let fmt: WavFormat | null = null;
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      if (view.getUint16(body, true) !== 1) return null; // chỉ nhận PCM
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data" && fmt) {
      const end = Math.min(body + size, buf.byteLength);
      return { ...fmt, pcm: buf.subarray(body, end) };
    }
    off = body + size + (size % 2);
  }
  return null;
}

function sameFormat(a: WavFormat, b: WavFormat) {
  return a.sampleRate === b.sampleRate && a.channels === b.channels && a.bitsPerSample === b.bitsPerSample;
}

/** Cắt lặng đầu/đuôi của một mảnh (chỉ cho PCM 16-bit), chừa lại một chút cho tự nhiên. */
function trimSilence(w: ParsedWav): Uint8Array {
  if (w.bitsPerSample !== 16) return w.pcm;
  const frame = 2 * w.channels;
  const view = new DataView(w.pcm.buffer, w.pcm.byteOffset, w.pcm.byteLength);
  const frames = Math.floor(w.pcm.byteLength / frame);
  const loud = (i: number) => {
    for (let ch = 0; ch < w.channels; ch++) {
      if (Math.abs(view.getInt16(i * frame + ch * 2, true)) > SILENCE_THRESHOLD) return true;
    }
    return false;
  };
  let start = 0;
  while (start < frames && !loud(start)) start++;
  let end = frames - 1;
  while (end > start && !loud(end)) end--;
  if (start >= end) return w.pcm;
  const keep = Math.round((w.sampleRate * KEEP_EDGE_MS) / 1000);
  start = Math.max(0, start - keep);
  end = Math.min(frames - 1, end + keep);
  return w.pcm.subarray(start * frame, (end + 1) * frame);
}

export function buildWav(fmt: WavFormat, parts: Uint8Array[]): Uint8Array {
  const dataLen = parts.reduce((s, p) => s + p.byteLength, 0);
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
  put(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, fmt.channels, true);
  view.setUint32(24, fmt.sampleRate, true);
  view.setUint32(28, fmt.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, fmt.bitsPerSample, true);
  put(36, "data");
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out;
}

function silence(fmt: WavFormat, ms: number): Uint8Array {
  const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
  return new Uint8Array(Math.round((fmt.sampleRate * ms) / 1000) * blockAlign);
}

// ---------------------------------------------------------------------------
// Bộ nhớ đệm mảnh: RAM → đĩa → gọi service
// ---------------------------------------------------------------------------

const mem = new Map<string, Uint8Array>();
const MEM_MAX = 400;
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

function segmentKey(voice: string, text: string) {
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

/** Tiếng của MỘT mảnh. `hit` = có sẵn, không phải gọi service. */
export async function getSegment(text: string, voice: string): Promise<{ wav: Uint8Array; hit: boolean }> {
  const key = segmentKey(voice, text);
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
    // Ghi ra file tạm rồi đổi tên: hai yêu cầu trùng mảnh cùng lúc không đọc phải file dở.
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

/**
 * Tiếng của cả câu = ghép các mảnh + khoảng lặng.
 *
 * Mảnh nào có định dạng lạ thì lùi về tổng hợp nguyên câu như cách cũ, để
 * không bao giờ phát ra thứ tiếng ghép sai.
 */
export async function speakSentence(
  text: string,
  voice: string,
): Promise<{ wav: Uint8Array; segments: number; hits: number }> {
  const segs: SpeechSegment[] = speechSegments(text);
  if (segs.length <= 1) {
    const one = await getSegment(segs[0]?.text ?? text, voice);
    return { wav: one.wav, segments: 1, hits: one.hit ? 1 : 0 };
  }

  const got = await Promise.all(segs.map((s) => getSegment(s.text, voice)));
  const parsed = got.map((g) => parseWav(g.wav));
  const fmt = parsed[0];
  if (!fmt || parsed.some((p) => !p || !sameFormat(p, fmt))) {
    return { wav: await synthesize(text, voice), segments: segs.length, hits: 0 };
  }

  const parts: Uint8Array[] = [];
  parsed.forEach((p, i) => {
    parts.push(trimSilence(p!));
    if (i < parsed.length - 1) parts.push(silence(fmt, PAUSE_MS[segs[i].pause]));
  });
  return {
    wav: buildWav(fmt, parts),
    segments: segs.length,
    hits: got.filter((g) => g.hit).length,
  };
}
