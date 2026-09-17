"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@restai/ui/components/select";
import { useStationStore, type SpeechMode } from "@/stores/station-store";
import { useTranslation } from "@/stores/lang-store";
import { useTtsVoices } from "@/hooks/use-tts";
import { primeAudio, setSpeechVoice, speak } from "@/lib/speech";

/**
 * Cấu hình "đọc phiếu bằng loa" cho CHÍNH MÁY NÀY.
 *
 * ⚠️ Phải đặt được ở trang **Kết nối** chứ không chỉ trong Cài đặt: máy quầy
 * đăng nhập bằng tài khoản **thu ngân**, mà thu ngân không có `/settings`
 * (xem `allowedPaths` trong layout dashboard). Để riêng bên Cài đặt là đúng
 * người bật thì không vào được, còn người vào được thì đang ngồi máy khác —
 * mà cấu hình này lưu theo từng máy.
 */
export function StationSpeechSettings() {
  const { lang } = useTranslation();
  const isStation = useStationStore((s) => s.isStation);
  const speechMode = useStationStore((s) => s.speechMode);
  const speechVoice = useStationStore((s) => s.speechVoice);
  const setMode = useStationStore((s) => s.setSpeechMode);
  const setVoice = useStationStore((s) => s.setSpeechVoice);
  // Chỉ hỏi danh sách giọng khi máy này thực sự là trạm — máy khác không cần.
  const { data: voices } = useTtsVoices({ enabled: isStation });

  // Tránh lệch SSR/CSR vì giá trị nằm ở localStorage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const vi = lang === "vi";
  const off = mounted && (!isStation || speechMode === "off");

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Volume2 className="h-4 w-4" />
          {vi ? "Đọc phiếu bằng loa" : "Read tickets aloud"}
        </p>
        <p className="text-xs text-muted-foreground">
          {vi
            ? "Loa máy quầy đọc đơn mới trong lúc máy in đang ra giấy — người pha nghe được mà không phải cầm phiếu lên."
            : "The counter speaker announces new orders while the ticket prints."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["off", vi ? "Tắt" : "Off"],
            ["short", vi ? "Số phiếu" : "Number only"],
            ["full", vi ? "Đọc cả món" : "Full order"],
          ] as Array<[SpeechMode, string]>
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={mounted && speechMode === value ? "default" : "outline"}
            disabled={mounted && !isStation}
            onClick={() => {
              // Mở khóa phát tiếng ngay trong cú bấm này: Chrome chỉ cho phát
              // tự động sau khi người dùng đã chạm vào trang một lần.
              if (value !== "off") primeAudio();
              setMode(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={mounted ? speechVoice : "nu"} onValueChange={(v) => setVoice(v)} disabled={off}>
          <SelectTrigger className="sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nu">{vi ? "Giọng nữ (Ái Hân)" : "Female (Ái Hân)"}</SelectItem>
            <SelectItem value="nam">{vi ? "Giọng nam (Adam)" : "Male (Adam)"}</SelectItem>
            {(voices ?? [])
              .filter((g) => g.name !== "Ái Hân" && g.name !== "Adam")
              .map((g) => (
                <SelectItem key={g.name} value={g.name}>
                  {g.label || g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={off}
          onClick={() => {
            primeAudio();
            setSpeechVoice(speechVoice);
            speak("Phiếu hai mươi bảy, mang về. Hai bạc xỉu nóng, ít đường.");
          }}
        >
          {vi ? "Nghe thử" : "Test voice"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {vi
          ? "Chỉ hai giọng đầu là giọng miền Nam. Lúc dồn nhiều đơn, máy tự rút gọn còn số phiếu để đọc kịp."
          : "Only the first two voices are southern. When orders pile up, announcements shorten automatically."}
      </p>
    </div>
  );
}
