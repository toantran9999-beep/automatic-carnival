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

export * from "./vietqr.js";
