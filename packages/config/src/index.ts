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
