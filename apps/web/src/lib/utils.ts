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

/**
 * Thời gian đã trôi: "54p" khi dưới 1 giờ, "1h26p" khi trên — kiểu iPOS.
 *
 * ⚠️ Dùng CHUNG cho thẻ bàn, thẻ đơn mang về và các hộp thoại chi tiết. Trước đây hàm
 * này bị chép đôi ở hai file; thêm chỗ dùng thứ ba mà cứ chép tiếp thì sửa cách hiện
 * phải nhớ sửa đủ ba nơi. Đừng đổi định dạng: nhân viên đã quen đọc "1h26p".
 */
export function formatElapsed(startedAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  if (mins < 60) return `${mins}p`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}p`;
}

/**
 * Số lượng kho — độ chính xác co giãn theo độ lớn của chính con số.
 *
 *   ≥ 10  → làm tròn số nguyên      3000 → "3.000",  95,4 → "95"
 *   < 10  → tối đa 2 số lẻ, bỏ 0 thừa   0,5 → "0,5",  0,20 → "0,2"
 *
 * ⚠️ Vì sao KHÔNG làm tròn cứng: muối 0,5g và bột xanthan 0,2g mỗi ly là số thật.
 * Làm tròn cứng là cả cột Lịch sử kho của mấy thứ đó thành "0" — nhìn như kho không
 * trừ gì cả. Ngược lại 3.000g hạt thì phần lẻ chẳng ai quan tâm.
 *
 * Một hàm duy nhất cho mọi màn hình, để chỗ này hiện "95" mà chỗ kia hiện "95.400"
 * thì không xảy ra.
 */
export function formatQty(value: number | string): string {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (!Number.isFinite(n)) return "0";

  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch {
    // Bỏ qua lỗi hydrate phía máy chủ — mặc định tiếng Việt.
  }

  const decimals = Math.abs(n) >= 10 ? 0 : 2;
  return n.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    minimumFractionDigits: 0,
    // maximumFractionDigits tự bỏ số 0 thừa: 0,20 → "0,2", 8,00 → "8".
    maximumFractionDigits: decimals,
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


/**
 * Ngày dạng 'YYYY-MM-DD' → '26/07/2026'.
 *
 * ⚠️ Ghép "T00:00:00Z" rồi đọc bằng getUTC*: dùng `new Date('2026-07-26')` rồi
 * `toLocaleDateString` thì máy ở múi giờ âm sẽ lùi mất một ngày.
 */
export function formatDayMonthYear(isoDate: string, lang: string = "vi"): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return lang === "vi" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

/** Tiền (xu) rút gọn cho trục biểu đồ: 405000000 → '4tr'. */
export function shortMoney(cents: number, lang: string = "vi"): string {
  const dong = cents / 100;
  if (dong >= 1_000_000) return `${Math.round(dong / 1_000_000)}${lang === "vi" ? "tr" : "M"}`;
  if (dong >= 1_000) return `${Math.round(dong / 1_000)}k`;
  return String(Math.round(dong));
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
