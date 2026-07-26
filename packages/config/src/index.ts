// Roles hierarchy and permissions
export const ROLES = {
  super_admin: { level: 0, label: "Super Admin" },
  org_admin: { level: 1, label: "Org Admin" },
  branch_manager: { level: 2, label: "Quản lý" },
  cashier: { level: 3, label: "Thu ngân" },
  waiter: { level: 4, label: "Phục vụ" },
  kitchen: { level: 5, label: "Bếp" },
} as const;

export type Role = keyof typeof ROLES;

// Permission definitions per role
export const PERMISSIONS = {
  super_admin: ["*"],
  org_admin: [
    "org:read", "org:update",
    "branch:*",
    "menu:*", "orders:*", "tables:*",
    "staff:*", "inventory:*", "loyalty:*",
    "customers:*",
    "payments:*", "reports:*", "invoices:*",
    "shifts:*",
    "settings:*",
  ],
  branch_manager: [
    "branch:read", "branch:update",
    "menu:*", "orders:*", "tables:*",
    "staff:read", "staff:create", "staff:update",
    "inventory:*", "loyalty:*",
    "customers:*",
    "payments:*", "reports:read",
    "shifts:*",
    "invoices:*", "settings:read", "settings:update",
  ],
  cashier: [
    "menu:read",
    "tables:read", "tables:update",
    "orders:read", "orders:create", "orders:update",
    "payments:*", "customers:*",
    "shifts:*",
    "invoices:create", "invoices:read",
  ],
  waiter: [
    "tables:read", "tables:update",
    "orders:create", "orders:read", "orders:update",
    "menu:read",
    "shifts:read",
    // Phục vụ thu tiền và xác nhận thanh toán ngay trên điện thoại tại bàn.
    // ⚠️ CỐ Ý KHÔNG có "reports:*" (không cho xem doanh thu) và KHÔNG có
    // "shifts:manage" (không cho mở/đóng ca — kèm số chốt tiền mặt). Đừng gộp
    // thành "payments:*" hay thêm quyền cho "gọn": đây là giới hạn chủ quán đặt.
    "payments:create", "payments:read",
    "invoices:create", "invoices:read",
  ],
  kitchen: [
    "orders:read",
    "orders:update",
    "orders:update_item_status",
  ],
} as const;

// Order status state machine
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "preparing", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

export const ORDER_ITEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["preparing"],
  preparing: ["ready"],
  ready: ["served"],
  served: [],
};

// Table status transitions
export const TABLE_STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ["occupied", "reserved", "maintenance"],
  occupied: ["available", "maintenance"],
  reserved: ["occupied", "available", "maintenance"],
  maintenance: ["available"],
};

// Vietnam-specific constants. Keep the exported name for compatibility with existing imports.
export const PERU = {
  CURRENCY: "VND",
  TIMEZONE: "Asia/Ho_Chi_Minh",
  DEFAULT_TAX_RATE: 1000, // 10.00% VAT stored as basis points
  TAX_NAME: "VAT",
} as const;

// JWT config
export const JWT_CONFIG = {
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL: "7d",
  CUSTOMER_TOKEN_TTL: "4h",
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Payment methods with labels
export const PAYMENT_METHODS = {
  cash: { label: "Tiền mặt" },
  card: { label: "Thẻ" },
  yape: { label: "QR ngân hàng" },
  plin: { label: "Ví điện tử" },
  transfer: { label: "Chuyển khoản" },
  other: { label: "Khác" },
} as const;

// Invoice types
export const INVOICE_TYPES = {
  boleta: { label: "Hóa đơn bán lẻ", doc_types: ["dni", "ce"] },
  factura: { label: "Hóa đơn VAT", doc_types: ["ruc"] },
} as const;

/**
 * Danh sách ngân hàng Việt Nam kèm mã BIN 6 số theo chuẩn NAPAS/VietQR.
 * BIN là thứ BẮT BUỘC để dựng mã QR chuyển khoản hợp lệ — không phải tên viết tắt
 * hay tên đầy đủ. Dùng chung cho API (dựng mã QR) và web (ô chọn ngân hàng).
 */
export const VN_BANKS = [
  { bin: "970436", shortName: "VCB", name: "Vietcombank" },
  { bin: "970415", shortName: "ICB", name: "VietinBank" },
  { bin: "970418", shortName: "BIDV", name: "BIDV" },
  { bin: "970405", shortName: "VBA", name: "Agribank" },
  { bin: "970407", shortName: "TCB", name: "Techcombank" },
  { bin: "970422", shortName: "MB", name: "MB Bank" },
  { bin: "970416", shortName: "ACB", name: "ACB" },
  { bin: "970432", shortName: "VPB", name: "VPBank" },
  { bin: "970403", shortName: "STB", name: "Sacombank" },
  { bin: "970423", shortName: "TPB", name: "TPBank" },
  { bin: "970437", shortName: "HDB", name: "HDBank" },
  { bin: "970441", shortName: "VIB", name: "VIB" },
  { bin: "970443", shortName: "SHB", name: "SHB" },
  { bin: "970440", shortName: "SEAB", name: "SeABank" },
  { bin: "970426", shortName: "MSB", name: "MSB" },
  { bin: "970448", shortName: "OCB", name: "OCB" },
  { bin: "970431", shortName: "EIB", name: "Eximbank" },
  { bin: "970449", shortName: "LPB", name: "LPBank" },
  { bin: "970428", shortName: "NAB", name: "Nam A Bank" },
  { bin: "970409", shortName: "BAB", name: "BacA Bank" },
  { bin: "970412", shortName: "PVCB", name: "PVcomBank" },
  { bin: "970429", shortName: "SCB", name: "SCB" },
  { bin: "970425", shortName: "ABB", name: "ABBANK" },
  { bin: "970427", shortName: "VAB", name: "VietABank" },
  { bin: "970438", shortName: "BVB", name: "BaoViet Bank" },
  { bin: "970452", shortName: "KLB", name: "KienlongBank" },
  { bin: "970419", shortName: "NCB", name: "NCB" },
  { bin: "970454", shortName: "VCCB", name: "BVBank" },
  { bin: "970430", shortName: "PGB", name: "PGBank" },
  { bin: "970400", shortName: "SGICB", name: "SaigonBank" },
  { bin: "970433", shortName: "VIETBANK", name: "VietBank" },
  { bin: "970434", shortName: "IVB", name: "Indovina Bank" },
  { bin: "970442", shortName: "HLBVN", name: "Hong Leong Bank" },
  { bin: "970446", shortName: "COOPBANK", name: "Co-op Bank" },
  { bin: "546034", shortName: "CAKE", name: "CAKE by VPBank" },
  { bin: "546035", shortName: "Ubank", name: "Ubank by VPBank" },
  { bin: "963388", shortName: "TIMO", name: "Timo by BVBank" },
  { bin: "971011", shortName: "VNPTMONEY", name: "VNPT Money" },
  { bin: "971005", shortName: "VIETTELMONEY", name: "Viettel Money" },
] as const;

export type VnBank = (typeof VN_BANKS)[number];

/**
 * Dựng mã QR chuyển khoản VietQR (chuẩn EMVCo / NAPAS).
 *
 * ⚠️ Trước đây hệ thống nhét THẲNG đường link ảnh img.vietqr.io vào QR in trên phiếu,
 * nên app ngân hàng đọc ra một cái URL và báo "Mã thanh toán không hợp lệ".
 * Máy in nhiệt tự vẽ QR từ chuỗi được đưa vào, nên chuỗi đó BẮT BUỘC phải là
 * payload EMVCo thật thì app ngân hàng mới hiểu.
 */

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
