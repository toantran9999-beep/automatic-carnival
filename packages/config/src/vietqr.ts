/**
 * Dựng mã QR chuyển khoản VietQR (chuẩn EMVCo / NAPAS).
 *
 * ⚠️ Trước đây hệ thống nhét THẲNG đường link ảnh img.vietqr.io vào QR in trên phiếu,
 * nên app ngân hàng đọc ra một cái URL và báo "Mã thanh toán không hợp lệ".
 * Máy in nhiệt tự vẽ QR từ chuỗi được đưa vào, nên chuỗi đó BẮT BUỘC phải là
 * payload EMVCo thật thì app ngân hàng mới hiểu.
 */

import { VN_BANKS } from "./index.js";

/** Bỏ dấu tiếng Việt + ký tự lạ — nội dung chuyển khoản phải là ASCII. */
export function toAscii(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/** Chuẩn hóa để so khớp tên ngân hàng: bỏ dấu, bỏ khoảng trắng, viết thường. */
function normalizeKey(value: string): string {
  return toAscii(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Nhận BIN 6 số, tên viết tắt (VCB) hoặc tên đầy đủ (Vietcombank) → trả về BIN.
 * Nhờ vậy cấu hình cũ đang lưu chữ "Vietcombank" vẫn chạy đúng, không phải sửa tay.
 */
export function resolveBankBin(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^\d{6}$/.test(raw)) return raw;

  const key = normalizeKey(raw);
  if (!key) return null;

  for (const bank of VN_BANKS) {
    if (normalizeKey(bank.shortName) === key || normalizeKey(bank.name) === key) return bank.bin;
  }
  // Khớp lỏng: "vietcombank" nằm trong "ngan hang vietcombank", hoặc ngược lại
  for (const bank of VN_BANKS) {
    const nameKey = normalizeKey(bank.name);
    if (nameKey.length >= 3 && (key.includes(nameKey) || nameKey.includes(key))) return bank.bin;
  }
  return null;
}

export function bankDisplayName(bin: string | null, fallback = ""): string {
  if (!bin) return fallback;
  return VN_BANKS.find((b) => b.bin === bin)?.name || fallback || bin;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) — chuẩn checksum của EMVCo. */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Một trường EMVCo: id (2 ký tự) + độ dài (2 chữ số) + giá trị. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export interface VietQrInput {
  bin: string;
  accountNumber: string;
  /** Số tiền VND (số nguyên, không phải cents). Bỏ trống = QR không kèm số tiền. */
  amountVnd?: number;
  /** Nội dung chuyển khoản — tự bỏ dấu và cắt còn 25 ký tự theo giới hạn của chuẩn. */
  addInfo?: string;
}

/**
 * Trả về chuỗi payload VietQR hoàn chỉnh (đã có CRC ở cuối), hoặc null nếu
 * thiếu BIN / số tài khoản. KHÔNG bao giờ trả chuỗi rác — thà không in QR còn hơn
 * in mã hỏng cho khách quét.
 */
export function buildVietQrPayload(input: VietQrInput): string | null {
  const bin = String(input.bin ?? "").trim();
  const accountNumber = toAscii(input.accountNumber ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(bin) || !accountNumber) return null;

  const amount =
    input.amountVnd !== undefined && input.amountVnd !== null && Number(input.amountVnd) > 0
      ? String(Math.round(Number(input.amountVnd)))
      : "";

  // Field 38 — thông tin thụ hưởng VietQR
  const merchantAccount = field(
    "38",
    field("00", "A000000727") +
      field("01", field("00", bin) + field("01", accountNumber)) +
      field("02", "QRIBFTTA"), // chuyển tới TÀI KHOẢN (QRIBFTTC là tới thẻ)
  );

  let payload =
    field("00", "01") +
    // 11 = mã dùng nhiều lần, 12 = mã một lần (có số tiền cố định)
    field("01", amount ? "12" : "11") +
    merchantAccount +
    field("53", "704") + // VND
    (amount ? field("54", amount) : "") +
    field("58", "VN");

  const addInfo = toAscii(input.addInfo ?? "").slice(0, 25);
  if (addInfo) payload += field("62", field("08", addInfo));

  // CRC tính trên toàn bộ chuỗi ĐÃ GỒM "6304"
  payload += "6304";
  return payload + crc16ccitt(payload);
}
