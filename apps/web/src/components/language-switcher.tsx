"use client";

import { useTranslation } from "@/stores/lang-store";
import { Button } from "@restai/ui/components/button";

export function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();

  return (
    <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/50">
      <Button
        type="button"
        variant={lang === "vi" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2.5 text-xs font-semibold"
        onClick={() => setLang("vi")}
      >
        VI
      </Button>
      <Button
        type="button"
        variant={lang === "en" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2.5 text-xs font-semibold"
        onClick={() => setLang("en")}
      >
        EN
      </Button>
    </div>
  );
}
