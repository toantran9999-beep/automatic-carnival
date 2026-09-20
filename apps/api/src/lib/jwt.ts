import { sign, verify } from "hono/jwt";

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET environment variables are required");
}

const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET;

export async function signAccessToken(payload: {
  sub: string;
  org: string;
  role: string;
  branches: string[];
}) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, iat: now, exp: now + 15 * 60 },
    JWT_SECRET,
  );
}

export async function signRefreshToken(payload: { sub: string }) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, iat: now, exp: now + 7 * 24 * 60 * 60 },
    JWT_REFRESH_SECRET,
  );
}

export async function signCustomerToken(payload: {
  sub: string;
  org: string;
  branch: string;
  table: string;
  customerId?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, role: "customer", iat: now, exp: now + 4 * 60 * 60 },
    JWT_SECRET,
  );
}

/**
 * Vé mở khoá tab Đơn hàng — sống 5 PHÚT.
 *
 * Nhân viên phải nhập mã của chủ quán mới lấy được vé này; mọi đường ĐỌC ĐƠN CŨ
 * đều đòi nó (xem `requireOrdersGate`).
 *
 * ⚠️ Cố ý là vé RIÊNG, không nhét claim vào access token: access token làm mới
 * mỗi 15 phút, nhét vào đó là claim rụng giữa chừng mà không ai hiểu vì sao.
 *
 * ⚠️ Cố ý KHÔNG lưu trạng thái ở máy chủ (bảng hay Redis): vé ngắn nên không cần
 * thu hồi, và làm thế này thì API khởi động lại không đá văng người đang xem.
 * Đánh đổi: đổi mã KHÔNG cắt ngay người đang mở dở — tối đa 5 phút sau là hết.
 */
export async function signOrdersGateToken(payload: { sub: string; branch: string }) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, purpose: "orders_gate", iat: now, exp: now + 5 * 60 },
    JWT_SECRET,
  );
}

export async function verifyOrdersGateToken(token: string) {
  const payload: any = await verify(token, JWT_SECRET, "HS256");
  // Vé phải TỰ KHAI mục đích: không có dòng này thì một access token thường
  // cũng lọt qua cửa, vì cùng ký bằng một khoá.
  if (payload?.purpose !== "orders_gate") throw new Error("WRONG_PURPOSE");
  return payload;
}

export async function verifyAccessToken(token: string) {
  return verify(token, JWT_SECRET, "HS256");
}

export async function verifyRefreshToken(token: string) {
  return verify(token, JWT_REFRESH_SECRET, "HS256");
}
