"use client";

import { create } from "zustand";

export type ThemeMode = "dark" | "light";

export const ACCENTS: { id: string; label: string; hex: string }[] = [
  { id: "matcha", label: "Xanh matcha", hex: "#7aa653" },
  { id: "indochine", label: "Vàng Đông Dương", hex: "#c79a2e" },
  { id: "terracotta", label: "Terracotta gạch", hex: "#b06b4e" },
  { id: "jade", label: "Xanh ngọc", hex: "#5a9d8c" },
];

const THEME_KEY = "toda_theme";
const ACCENT_KEY = "toda_accent";
const DEFAULT_THEME: ThemeMode = "dark";
const DEFAULT_ACCENT = "#7aa653";

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.classList.toggle("light", theme === "light");
}

function applyAccent(hex: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--accent-runtime", hex);
}

function readInitial(): { theme: ThemeMode; accent: string } {
  if (typeof localStorage === "undefined") {
    return { theme: DEFAULT_THEME, accent: DEFAULT_ACCENT };
  }
  const theme = (localStorage.getItem(THEME_KEY) as ThemeMode) || DEFAULT_THEME;
  const accent = localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT;
  return { theme, accent };
}

interface ThemeState {
  theme: ThemeMode;
  accent: string;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setAccent: (hex: string) => void;
}

const initial = readInitial();

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial.theme,
  accent: initial.accent,
  setTheme: (theme) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
  setAccent: (accent) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(ACCENT_KEY, accent);
    applyAccent(accent);
    set({ accent });
  },
}));
