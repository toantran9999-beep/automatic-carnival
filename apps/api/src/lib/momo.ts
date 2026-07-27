import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "./logger.js";

/**
 * Cổng thanh toán MoMo — QR động (khách quét) + IPN (MoMo báo về khi tiền vào).
 *
 * ⚠️ Toàn bộ thứ chạm MoMo nằm gọn trong file này. File chỉ chạy phía API,
 * web KHÔNG import — nên tách file riêng là an toàn (khác `packages/config`,
 * nơi bắt buộc để chung một file vì Next build không resolve được specifier).
 */

export type MomoEnv = "test" | "production";

/** MoMo từ chối ngoài khoảng này (đơn vị VND nguyên, không phải cents). */
export const MOMO_MIN_VND = 1_000;
export const MOMO_MAX_VND = 50_000_000;

/** Tài liệu MoMo yêu cầu timeout tối thiểu 30 giây cho mọi lệnh gọi. */
const MOMO_TIMEOUT_MS = 30_000;

export interface MomoCredentials {
  env: MomoEnv;
  partnerCode: string;
  accessKey: string;
  secretKey: string;
}

export function momoBaseUrl(env: MomoEnv) {
  return env === "production" ? "https://payment.momo.vn" : "https://test-payment.momo.vn";
}

function signMomo(secretKey: string, rawSignature: string) {
  return createHmac("sha256", secretKey).update(rawSignature).digest("hex");
}

/** So chuỗi chữ ký theo kiểu chống dò thời gian. */
function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a || "", "utf8");
  const bufB = Buffer.from(b || "", "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function postMomo(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MOMO_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`MoMo trả về dữ liệu không đọc được (HTTP ${res.status})`);
  }
  return json;
}

/**
 * Tạo giao dịch QR động. Trả `qrCodeUrl` — CHUỖI DỮ LIỆU để tự vẽ QR, KHÔNG
 * phải link ảnh. Nhét thẳng chuỗi này vào `payment_requests.qr_payload`.
 *
 * ⚠️ Đã có sự cố cũ (bugfix-vietqr-payload): nhét link ảnh vào chỗ đáng lẽ là
 * payload QR khiến máy in vẽ ra QR chứa cái URL, khách quét báo mã không hợp lệ.
 * Đừng lặp lại — `qrCodeUrl` của MoMo bản thân nó đã là payload.
 */
export async function createMomoPayment(args: MomoCredentials & {
  orderId: string;
  requestId: string;
  amountVnd: number;
  orderInfo: string;
  ipnUrl: string;
  redirectUrl: string;
  extraData?: string;
}) {
  const extraData = args.extraData ?? "";
  const requestType = "captureWallet";

  // Thứ tự các trường PHẢI xếp a→z. Sai một chỗ là MoMo trả lỗi chữ ký.
  const rawSignature =
    `accessKey=${args.accessKey}` +
    `&amount=${args.amountVnd}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${args.ipnUrl}` +
    `&orderId=${args.orderId}` +
    `&orderInfo=${args.orderInfo}` +
    `&partnerCode=${args.partnerCode}` +
    `&redirectUrl=${args.redirectUrl}` +
    `&requestId=${args.requestId}` +
    `&requestType=${requestType}`;

  const body = {
    partnerCode: args.partnerCode,
    partnerName: "TODA POS",
    storeId: args.partnerCode,
    requestId: args.requestId,
    amount: args.amountVnd,
    orderId: args.orderId,
    orderInfo: args.orderInfo,
    redirectUrl: args.redirectUrl,
    ipnUrl: args.ipnUrl,
    lang: "vi",
    requestType,
    extraData,
    signature: signMomo(args.secretKey, rawSignature),
  };

  const json = await postMomo(`${momoBaseUrl(args.env)}/v2/gateway/api/create`, body);

  if (Number(json.resultCode) !== 0) {
    logger.error("MoMo từ chối tạo giao dịch", {
      resultCode: json.resultCode,
      momoMessage: json.message,
      orderId: args.orderId,
    });
    throw new Error(json.message || `MoMo từ chối tạo giao dịch (mã ${json.resultCode})`);
  }

  if (!json.qrCodeUrl) {
    throw new Error("MoMo không trả qrCodeUrl — không dựng được mã QR cho khách quét");
  }

  return {
    qrCodeUrl: String(json.qrCodeUrl),
    payUrl: json.payUrl ? String(json.payUrl) : null,
    deeplink: json.deeplink ? String(json.deeplink) : null,
  };
}

/**
 * Đối chiếu chữ ký gói tin IPN. Trường và thứ tự do MoMo quy định, khác với
 * chuỗi ký lúc tạo giao dịch — không dùng chung hàm dựng chuỗi được.
 */
export function verifyMomoIpnSignature(body: any, creds: Pick<MomoCredentials, "accessKey" | "secretKey">) {
  const rawSignature =
    `accessKey=${creds.accessKey}` +
    `&amount=${body.amount ?? ""}` +
    `&extraData=${body.extraData ?? ""}` +
    `&message=${body.message ?? ""}` +
    `&orderId=${body.orderId ?? ""}` +
    `&orderInfo=${body.orderInfo ?? ""}` +
    `&orderType=${body.orderType ?? ""}` +
    `&partnerCode=${body.partnerCode ?? ""}` +
    `&payType=${body.payType ?? ""}` +
    `&requestId=${body.requestId ?? ""}` +
    `&responseTime=${body.responseTime ?? ""}` +
    `&resultCode=${body.resultCode ?? ""}` +
    `&transId=${body.transId ?? ""}`;

  return safeEqual(signMomo(creds.secretKey, rawSignature), String(body.signature || ""));
}

/**
 * Hỏi lại MoMo trạng thái một đơn. Dùng để đối soát khi IPN không tới —
 * tài liệu MoMo nói rõ IPN có thể rớt, đừng coi nó là nguồn duy nhất.
 */
export async function queryMomoTransaction(args: MomoCredentials & {
  orderId: string;
  requestId: string;
}) {
  const rawSignature =
    `accessKey=${args.accessKey}` +
    `&orderId=${args.orderId}` +
    `&partnerCode=${args.partnerCode}` +
    `&requestId=${args.requestId}`;

  const json = await postMomo(`${momoBaseUrl(args.env)}/v2/gateway/api/query`, {
    partnerCode: args.partnerCode,
    requestId: args.requestId,
    orderId: args.orderId,
    lang: "vi",
    signature: signMomo(args.secretKey, rawSignature),
  });

  return {
    resultCode: Number(json.resultCode),
    message: String(json.message || ""),
    transId: json.transId != null ? String(json.transId) : "",
    /** VND nguyên. */
    amount: Number(json.amount || 0),
    raw: json,
  };
}
