"use client";

import { docSo, sanitizeSpeech } from "@restai/config";
import { apiFetchBlob } from "@/lib/fetcher";

/**
 * Đọc phiếu bằng loa trạm quầy — CÙNG LÚC với lúc máy in đang nhả giấy.
 *
 * Tiếng nói là LỚP PHỤ TRỢ: máy in vẫn là đường chính và tiếng "ting" của
 * `beep.ts` vẫn là dấu hiệu chính. Mọi thứ trong file này hỏng thì quầy phải
 * chạy y như hôm chưa có nó — không ném lỗi ra ngoài, không chặn việc in.
 *
 * Phần DỰNG CÂU nằm ở `@restai/config` (dùng chung với máy chủ, để máy chủ làm
 * sẵn đúng những câu hay gặp). File này chỉ còn hàng đợi phát.
 */

export { buildOrderSpeech, docSoPhieu, type SpeechMode } from "@restai/config";

interface QueueItem {
  text: string;
  at: number;
  /**
   * Tiếng của câu — bắt đầu tải NGAY lúc xếp hàng, không đợi tới lượt.
   *
   * ⚠️ Trước 27/10/2026 câu chỉ được tải khi câu trước đã đọc xong, và câu đầu
   * chỉ được xếp sau khi in xong + gửi xác nhận in → tiếng luôn tới sau tờ
   * giấy 2–3 giây (giấy ra 0,3 s sau khi có đơn, đo từ sổ `order_prints`).
   */
  audio: Promise<Blob | null>;
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

function fetchAudio(text: string, voice: string): Promise<Blob | null> {
  return apiFetchBlob("/api/tts/speak", {
    method: "POST",
    body: JSON.stringify({ text, voice }),
  }).catch(() => null); // Service đọc hỏng / mất mạng: câu này im, quầy vẫn in.
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
    const blob = await item.audio;
    // Tải lâu tới mức phiếu đã cũ thì thôi, đừng đọc một đơn từ phút trước.
    if (!blob || Date.now() - item.at > MAX_AGE_MS) return;
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
    // Phát hỏng: bỏ câu này, quầy vẫn in và vẫn kêu chuông.
  } finally {
    if (url) URL.revokeObjectURL(url);
    playing = false;
    if (queue.length) void playNext();
  }
}

/** Xếp một câu vào hàng đợi đọc. Không bao giờ ném lỗi ra ngoài. */
export function speak(text: string | null | undefined) {
  const clean = sanitizeSpeech(String(text ?? ""));
  if (!clean) return;
  queue.push({ text: clean, at: Date.now(), audio: fetchAudio(clean, currentVoice) });

  // Dồn quá nhiều thì đọc hết cũng không ai theo kịp — giữ vài phiếu đầu rồi
  // gộp phần dư thành một câu, hơn là đọc lải nhải mấy chục giây.
  if (queue.length > MAX_QUEUE) {
    const du = queue.splice(MAX_QUEUE - 1);
    const tom = sanitizeSpeech(`Còn ${docSo(du.length)} phiếu nữa.`);
    queue.push({ text: tom, at: Date.now(), audio: fetchAudio(tom, currentVoice) });
  }

  void playNext();
}
