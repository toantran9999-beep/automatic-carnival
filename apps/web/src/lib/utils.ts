import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useLangStore } from "@/stores/lang-store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sắp xếp danh mục/món theo thứ tự chủ quán tự đặt (sort_order), cùng thứ tự thì theo tên.
 * API trả snake_case nhưng vài nơi map sang camelCase nên nhận cả hai.
 */
export function sortByOrder<T extends Record<string, any>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const oa = Number(a.sortOrder ?? a.sort_order ?? 0);
    const ob = Number(b.sortOrder ?? b.sort_order ?? 0);
    if (oa !== ob) return oa - ob;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "vi");
  });
}

export function formatCurrency(cents: number, currencyCode?: string): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }

  const currency = currencyCode || "VND";
  const value = cents / 100;

  try {
    return new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: currency === "VND" ? 0 : 2,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(value);
  } catch (err) {
    if (currency === "VND") {
      const formatted = value.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      return lang === "vi" ? `${formatted} ₫` : `₫${formatted}`;
    }
    const formatted = value.toFixed(2);
    return lang === "vi" ? `${formatted} ${currency}` : `${currency} ${formatted}`;
  }
}


export function formatDate(date: string | Date): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }

  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
