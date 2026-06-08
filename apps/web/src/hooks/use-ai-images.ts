"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

type GenerateMenuImageInput = {
  name: string;
  description?: string;
  categoryName?: string;
};

type GenerateMenuImageResult = {
  url: string;
  key: string;
  prompt: string;
  model: string;
};

export function useGenerateMenuImage() {
  return useMutation({
    mutationFn: (data: GenerateMenuImageInput) =>
      apiFetch<GenerateMenuImageResult>("/api/ai-images/menu-item", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}
