/**
 * Tiếng "ting" ngắn báo có việc cần chú ý (đơn mới, tiền vừa về).
 *
 * Dựng bằng Web Audio nên không cần file âm thanh — máy POS ở quầy hay chạy
 * offline hoặc mạng chập chờn, tải một file mp3 về chỉ để kêu một tiếng là thừa
 * và dễ hỏng đúng lúc cần.
 */
export function beep(frequency = 880) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => ctx.close();
  } catch {
    // Âm thanh là phụ trợ — trình duyệt chặn autoplay thì bỏ qua, đừng ném lỗi.
  }
}

/** Hai tiếng cao dần — dành riêng cho "tiền đã về", nghe khác hẳn đơn mới. */
export function beepPaid() {
  beep(880);
  setTimeout(() => beep(1320), 160);
}
