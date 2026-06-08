import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translations, Language } from "@/lib/translations";

interface LangState {
  lang: Language;
  setLang: (lang: Language) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "vi", // Default to Vietnamese
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "restai-lang-storage",
    }
  )
);

export function useTranslation() {
  const { lang, setLang } = useLangStore();

  const t = (key: string, defaultValue?: string): string => {
    const keys = key.split(".");
    let value: any = translations[lang];

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Fallback to English if Vietnamese key is missing
        let enValue: any = translations["en"];
        for (const enK of keys) {
          if (enValue && typeof enValue === "object" && enK in enValue) {
            enValue = enValue[enK];
          } else {
            enValue = null;
            break;
          }
        }
        return typeof enValue === "string" ? enValue : (defaultValue || key);
      }
    }

    return typeof value === "string" ? value : (defaultValue || key);
  };

  return { t, lang, setLang };
}
export type { Language };
