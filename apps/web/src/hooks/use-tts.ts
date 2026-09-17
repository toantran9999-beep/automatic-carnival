"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { STATIC_QUERY } from "@/lib/query-config";

export interface TtsVoice {
  name: string;
  label: string;
}

/**
 * Danh sách giọng đọc của service TTS tự host.
 *
 * Hỏng thì máy chủ trả mảng rỗng (không phải lỗi) — Cài đặt chỉ hiện hai giọng
 * mặc định và loa vẫn đọc được.
 */
export function useTtsVoices(options?: { enabled?: boolean }) {
  return useQuery<TtsVoice[]>({
    queryKey: ["tts", "voices"],
    queryFn: () => apiFetch<TtsVoice[]>("/api/tts/voices", { includeBranchHeader: false }),
    enabled: options?.enabled ?? true,
    ...STATIC_QUERY,
  });
}
