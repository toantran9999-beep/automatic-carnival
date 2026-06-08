"use client";

import { Sun, Moon, Palette, Check } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@restai/ui/components/popover";
import { Button } from "@restai/ui/components/button";
import { cn } from "@/lib/utils";
import { useThemeStore, ACCENTS } from "@/stores/theme-store";

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const accent = useThemeStore((s) => s.accent);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title="Giao diện">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Chế độ
          </p>
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setTheme("light")}
            >
              <Sun className="h-4 w-4" /> Sáng
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-4 w-4" /> Tối
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Màu nhấn
          </p>
          <div className="grid grid-cols-4 gap-2">
            {ACCENTS.map((a) => {
              const active = accent.toLowerCase() === a.hex.toLowerCase();
              return (
                <button
                  key={a.id}
                  type="button"
                  title={a.label}
                  onClick={() => setAccent(a.hex)}
                  className={cn(
                    "relative h-9 rounded-lg border-2 transition-transform active:scale-95",
                    active ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: a.hex }}
                >
                  {active && (
                    <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
