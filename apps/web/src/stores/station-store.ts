"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cấu hình "Trạm in tại quầy" — lưu THEO THIẾT BỊ (localStorage), KHÔNG dùng
 * branch settings (vì branch settings dùng chung mọi máy). Chỉ bật trên đúng
 * máy POS Android có gắn máy in. Khi bật, máy này nghe `order:new` toàn chi
 * nhánh rồi tự in phiếu bếp + kêu chuông, dù đang mở màn hình nào.
 */
interface StationState {
  isStation: boolean;
  soundEnabled: boolean;
  setStation: (v: boolean) => void;
  setSound: (v: boolean) => void;
}

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      isStation: false,
      soundEnabled: true,
      setStation: (isStation) => set({ isStation }),
      setSound: (soundEnabled) => set({ soundEnabled }),
    }),
    { name: "toda-station" }
  )
);
