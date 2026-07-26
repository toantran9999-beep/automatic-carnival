// WebSocket message types
export type WsMessageType =
  | "order:new"
  | "order:updated"
  | "order:item_status"
  | "order:cancelled"
  | "table:status"
  | "table:layout_changed"
  | "table:call_waiter"
  | "table:request_bill"
  | "session:started"
  | "session:ended"
  | "session:pending"
  | "session:approved"
  | "session:rejected"
  | "kitchen:alert"
  | "shift:opened"
  | "shift:closed"
  | "payment:confirmed"
  | "payment:underpaid"
  /** Thực đơn/cài đặt chi nhánh vừa đổi → máy khác xoá cache thực đơn ngay. */
  | "menu:updated"
  | "ping"
  | "pong"
  | "auth:success";

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: number;
}

export interface WsOrderPayload {
  orderId: string;
  orderNumber: string;
  status: string;
  tableName?: string;
  /** Số bàn (cho trạm in tại quầy tự in phiếu). null = mang về/khách lẻ. */
  tableNumber?: number | null;
  /** Tên khu vực của bàn (Khu A, Khu B...) — in kèm số bàn cho dễ tìm. */
  tableZone?: string | null;
  customerName?: string | null;
  /**
   * Tên NHÂN VIÊN BẤM ĐƠN, in ở dòng "Nhân viên" của phiếu đặt món.
   * Bắt buộc đi kèm trong gói tin: phiếu do Trạm quầy (máy dùng chung) in ra,
   * nên không thể suy ra người order từ tài khoản đăng nhập trên máy in.
   * null = khách tự quét QR gọi món.
   */
  staffName?: string | null;
  /** ISO time đơn được tạo. */
  createdAt?: string;
  /** dine_in | takeout */
  orderType?: string;
  items?: WsOrderItemPayload[];
}

export interface WsOrderItemPayload {
  id: string;
  name: string;
  quantity: number;
  status: string;
  notes?: string;
  /** Đơn vị tính (Ly, Phần...) — cho phiếu bếp. */
  unit?: string | null;
}

export interface WsTablePayload {
  tableId: string;
  number: number;
  status: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Auth types
export interface JwtPayload {
  sub: string; // user id
  org: string; // organization id
  role: string;
  branches: string[];
  iat: number;
  exp: number;
}

export interface CustomerJwtPayload {
  sub: string; // session id
  org: string;
  branch: string;
  table: string;
  role: "customer";
  iat: number;
  exp: number;
}

// Tenant context
export interface TenantContext {
  organizationId: string;
  branchId: string;
}

// Dashboard types
export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number; // in cents
  averageOrderValue: number; // in cents
  activeOrders: number;
  occupiedTables: number;
  totalTables: number;
}

export interface SalesReport {
  period: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  byPaymentMethod: Record<string, number>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

// Cart types (for frontend)
export interface CartItem {
  menuItemId: string;
  name: string;
  unitPrice: number; // cents
  quantity: number;
  notes?: string;
  modifiers: CartModifier[];
}

export interface CartModifier {
  modifierId: string;
  name: string;
  price: number; // cents
}

export interface Cart {
  items: CartItem[];
  subtotal: number; // cents
  tax: number; // cents
  total: number; // cents
}
