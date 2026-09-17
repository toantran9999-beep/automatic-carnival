"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cấu hình "Trạm in tại quầy" — lưu THEO THIẾT BỊ (localStorage), KHÔNG dùng
 * branch settings (vì branch settings dùng chung mọi máy). Chỉ bật trên đúng
 * máy POS Android có gắn máy in. Khi bật, máy này nghe `order:new` toàn chi
 * nhánh rồi tự in phiếu bếp + kêu chuông, dù đang mở màn hình nào.
 */
export type SpeechMode = "off" | "short" | "full";

interface StationState {
  isStation: boolean;
  soundEnabled: boolean;
  /** Đọc phiếu bằng loa: tắt / chỉ số phiếu / đọc cả món. */
  speechMode: SpeechMode;
  /** Giọng đọc — "nu"/"nam" là hai nút mặc định, hoặc tên giọng cụ thể. */
  speechVoice: string;
  setStation: (v: boolean) => void;
  setSound: (v: boolean) => void;
  setSpeechMode: (v: SpeechMode) => void;
  setSpeechVoice: (v: string) => void;
}

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      isStation: false,
      soundEnabled: true,
      // Mặc định TẮT: máy quầy nào có loa ngoài thì chủ quán tự bật, kẻo máy
      // đang dùng làm trạm bỗng dưng nói chuyện giữa quán.
      speechMode: "off",
      speechVoice: "nu",
      setStation: (isStation) => set({ isStation }),
      setSound: (soundEnabled) => set({ soundEnabled }),
      setSpeechMode: (speechMode) => set({ speechMode }),
      setSpeechVoice: (speechVoice) => set({ speechVoice }),
    }),
    { name: "toda-station" }
  )
);
