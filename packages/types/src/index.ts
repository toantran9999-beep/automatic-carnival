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
  /**
   * Tiền ĐÃ VÀO tài khoản nhưng không khớp phiếu QR (bàn đổi món sau khi in phiếu).
   * Phải báo cho thu ngân: máy chủ từ chối chốt, nhưng tiền thì đã nằm trong tài khoản.
   */
  | "payment:mismatch"
  /** Máy bấm đơn xin Trạm quầy in phiếu QR chuyển khoản (xem WsPrintTransferPayload). */
  | "print:transfer"
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
  /**
   * Có = đây là lô MÓN THÊM vào đơn đang mở, `items` chỉ gồm món vừa thêm.
   *
   * ⚠️ Trạm quầy chống in trùng bằng `orderId`; đơn đó đã in rồi nên nếu không có
   * khóa riêng này thì món thêm bị bỏ qua, ÂM THẦM không ra phiếu.
   */
  addOnId?: string;
  /**
   * Có = đây là một lần IN LẠI phiếu gốc (nút "In lại phiếu đặt món").
   *
   * ⚠️ Trạm quầy chống in trùng theo `reprintToken || addOnId || orderId`, nên
   * in lại phải mang khóa MỚI, nếu không bị bỏ qua im lặng. Cố ý tách khỏi
   * `addOnId`: mượn khóa đó là phiếu in ra ghi "THÊM MÓN" sai sự thật.
   */
  reprintToken?: string;
  /**
   * Chi nhánh của đơn. Trạm quầy tự vào phòng của MỌI chi nhánh trong token
   * (`ws/handlers.ts`), nên phải có trường này để bỏ qua phiếu chi nhánh khác —
   * kẻo quầy chi nhánh chính in luôn phiếu Chi nhánh 2.
   */
  branchId?: string;
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

/**
 * Cổng thanh toán báo tiền đã về (`payment:confirmed`).
 *
 * Mang sẵn đủ dữ liệu để Trạm quầy IN NGAY hóa đơn — cùng lý do `order:new`
 * nhúng sẵn danh sách món: máy in không nên phải gọi API vòng hai rồi mới in.
 */
export interface WsPaymentConfirmedPayload {
  paymentRequestId: string;
  orderId: string;
  /** "sepay" (chuyển khoản ngân hàng) | "momo" (ví MoMo). */
  provider?: string;
  /** Số tiền thực nhận, đơn vị cents. */
  amount: number;
  expectedAmount: number;
  /** Đã trả đủ toàn bộ phiên bàn → bàn vừa được nhả. */
  fullyPaid?: boolean;
  orderNumber?: string;
  customerName?: string | null;
  tableNumber?: number | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  items?: WsPaymentItemPayload[];
}

export interface WsPaymentItemPayload {
  name: string;
  quantity: number;
  /** ⚠️ Giá GỐC, CHƯA gồm tùy chọn. Chỉ `total` mới là tiền cả dòng đã gồm. */
  unit_price: number;
  total: number;
  notes?: string | null;
  unit?: string | null;
  /**
   * Tùy chọn/topping, mỗi cái một dòng phụ trên phiếu ("- Nhẹ  -2.000đ").
   * Thiếu là phiếu in giá gốc mà tổng lại đã cộng/trừ tùy chọn → hai số vênh nhau.
   */
  modifiers?: Array<{ name: string; price: number }>;
}

/**
 * Xin Trạm quầy in phiếu QR chuyển khoản (`print:transfer`).
 *
 * ⚠️ Mã QR CHỈ được phép ra giấy, không bao giờ hiện lên màn hình máy bấm đơn.
 * Điện thoại nhân viên trước đây tự dựng QR rồi hiện luôn tại chỗ; chủ quán yêu
 * cầu mọi mã phải do trạm in sinh ra rồi bưng phiếu cho khách. Vì vậy máy bấm
 * đơn không còn nhận/hiện `qrPayload` nữa — nó đi đường này tới thẳng máy in.
 *
 * Mang sẵn đủ dữ liệu để in ngay, cùng lý do `order:new` nhúng sẵn danh sách món:
 * máy in không nên phải gọi API vòng hai rồi mới in.
 */
export interface WsPrintTransferPayload {
  paymentRequestId: string;
  orderId: string;
  orderNumber: string;
  tableNumber?: number | null;
  customerName?: string | null;
  /** ISO time phiếu hết hạn (60 phút). */
  expiresAt?: string | null;
  /** Mã nội dung chuyển khoản ("TODA-…"). */
  paymentCode: string;
  /** "sepay" (chuyển khoản ngân hàng) | "momo". */
  provider: string;
  /**
   * Chuỗi VietQR CHUẨN để vẽ QR.
   * ⚠️ null = chi nhánh chưa cấu hình ngân hàng → in phiếu KHÔNG có QR, tuyệt đối
   * đừng rơi về `paymentCode` (in ra "TODA-…" thì app ngân hàng báo mã không hợp lệ).
   */
  qrPayload?: string | null;
  /** Ảnh QR dựng sẵn của vietqr.io — chỉ dùng cho đường in bằng trình duyệt. */
  qrUrl?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  items: WsPaymentItemPayload[];
  bank?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    amountVnd: number;
    addInfo: string;
  } | null;
}

/** Khách chuyển thiếu so với số tiền trên QR — thu ngân phải xử tay. */
export interface WsPaymentUnderpaidPayload {
  paymentRequestId: string;
  orderId: string;
  amount: number;
  expectedAmount: number;
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
