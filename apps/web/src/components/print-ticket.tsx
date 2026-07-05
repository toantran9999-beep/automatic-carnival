"use client";

import { useCallback } from "react";
import { useLangStore } from "@/stores/lang-store";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchSettings } from "@/hooks/use-settings";

interface OrderItem {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
  /** Đơn vị tính (Ly, Phần, Dĩa...) — tùy chọn */
  unit?: string;
}

function currentStaffName(): string {
  try {
    return useAuthStore.getState()?.user?.name || "";
  } catch {
    return "";
  }
}

/** Định dạng "16:33" và "05 thg 01, 2021" theo giờ VN */
function vnTimeParts(dateStr: string): { time: string; date: string } {
  const d = new Date(dateStr);
  const time = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const date = `${get("day")} thg ${get("month")}, ${get("year")}`;
  return { time, date };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface KitchenTicketData {
  orderNumber: string;
  tableNumber?: string | number;
  customerName?: string;
  createdAt: string;
  items: OrderItem[];
  notes?: string;
  /** Optional "x/y" label shown when printing one ticket per item */
  ticketLabel?: string;
}

export type PrintMode = "combined" | "per_item";
type PrintDriver = "browser_print" | "rawbt_intent" | "android_bridge";
const ESC_POS_WIDTH = 38;
const ESC_POS_SEPARATOR = "-".repeat(ESC_POS_WIDTH);

interface ReceiptTicketData {
  businessName: string;
  ruc?: string;
  address?: string;
  phone?: string;
  orderNumber: string;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  customerName?: string;
  docType?: "boleta_simple" | "boleta_electronica" | "factura";
  docNumber?: string;
  docHolderName?: string;
}

/** Cấu hình mẫu hóa đơn — chủ quán chỉnh trong Cài đặt → Chi nhánh, lưu ở branch.settings.receipt. */
export interface ReceiptConfig {
  /** Số dòng trống đầu phiếu (khoảng trắng để kẹp vào gai/thanh hóa đơn) */
  topFeedLines: number;
  /** Khổ giấy máy in nhiệt — quyết định bề rộng khi in bitmap */
  paper: "58" | "80";
  /** In tiếng Việt CÓ DẤU bằng cách render ảnh (bitmap) thay vì text ESC/POS bỏ dấu */
  utf8Bitmap: boolean;
  /** Kiểu đường kẻ phân cách */
  separator: "dashed" | "solid" | "double" | "stars" | "none";
  /** Dòng chữ tuỳ ý ở đầu phiếu (dưới tên quán) */
  headerLines: string[];
  /** Dòng chữ tuỳ ý cuối phiếu (lời cảm ơn, wifi, fanpage...). null = dùng mặc định */
  footerLines: string[] | null;
  show: {
    address: boolean;
    phone: boolean;
    customer: boolean;
    paymentMethod: boolean;
    vat: boolean;
  };
}

const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  topFeedLines: 4,
  paper: "80",
  utf8Bitmap: false,
  separator: "dashed",
  headerLines: [],
  footerLines: null,
  show: { address: true, phone: false, customer: true, paymentMethod: true, vat: true },
};

export function getReceiptConfig(branchSettings: any): ReceiptConfig {
  const raw = branchSettings?.settings?.receipt || {};
  const show = raw.show || {};
  return {
    topFeedLines: Math.min(10, Math.max(0, Number(raw.top_feed_lines ?? DEFAULT_RECEIPT_CONFIG.topFeedLines))),
    paper: raw.paper === "58" ? "58" : "80",
    utf8Bitmap: !!raw.utf8_bitmap,
    separator: ["dashed", "solid", "double", "stars", "none"].includes(raw.separator)
      ? raw.separator
      : DEFAULT_RECEIPT_CONFIG.separator,
    headerLines: Array.isArray(raw.header_lines) ? raw.header_lines.filter(Boolean) : [],
    footerLines: Array.isArray(raw.footer_lines) ? raw.footer_lines.filter(Boolean) : null,
    show: {
      address: show.address ?? true,
      phone: show.phone ?? false,
      customer: show.customer ?? true,
      paymentMethod: show.payment_method ?? true,
      vat: show.vat ?? true,
    },
  };
}

function separatorChar(style: ReceiptConfig["separator"]): string {
  switch (style) {
    case "solid": return "_";
    case "double": return "=";
    case "stars": return "*";
    case "none": return "";
    default: return "-";
  }
}

function separatorLine(style: ReceiptConfig["separator"]): string {
  const ch = separatorChar(style);
  return ch ? ch.repeat(ESC_POS_WIDTH) : "";
}

interface TemporaryTransferBillData {
  businessName: string;
  address?: string;
  orderNumber: string;
  tableNumber?: string | number | null;
  customerName?: string;
  createdAt: string;
  expiresAt: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentCode: string;
  qrUrl?: string | null;
  qrPayload: string;
  bank?: {
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
    amountVnd?: number;
    addInfo?: string;
  };
}

function removeVietnameseMarks(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function plainLine(value = "", width = ESC_POS_WIDTH): string {
  const clean = removeVietnameseMarks(value).replace(/\s+/g, " ").trim();
  return clean.length > width ? clean.slice(0, width) : clean;
}

function centerLine(value = "", width = ESC_POS_WIDTH): string {
  const clean = plainLine(value, width);
  const left = Math.max(0, Math.floor((width - clean.length) / 2));
  return `${" ".repeat(left)}${clean}`;
}

function moneyPlain(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("vi-VN")} d`;
}

function textBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function bytesToBase64(bytes: number[]): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function twoCol(left: string, right: string, width = ESC_POS_WIDTH): string {
  const l = plainLine(left, width);
  const r = plainLine(right, width);
  return `${l}${" ".repeat(Math.max(1, width - l.length - r.length))}${r}`;
}

function escposAlign(position: "left" | "center" | "right"): number[] {
  const value = position === "center" ? 1 : position === "right" ? 2 : 0;
  return [0x1b, 0x61, value];
}

function escposQrBytes(value: string): number[] {
  const data = textBytes(value);
  const len = data.length + 3;
  const pL = len % 256;
  const pH = Math.floor(len / 256);
  return [
    0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30,
    ...data,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

function buildEscPos(lines: Array<string | number[]>): number[] {
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x00, ...escposAlign("left")];
  for (const item of lines) {
    if (Array.isArray(item)) {
      bytes.push(...item);
    } else {
      bytes.push(...textBytes(`${item}\n`));
    }
  }
  bytes.push(0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
  return bytes;
}

function buildKitchenEscPos(data: KitchenTicketData): number[] {
  const { time, date } = vnTimeParts(data.createdAt);
  const staff = currentStaffName();
  const subtitle = data.tableNumber ? `BAN ${data.tableNumber}` : "MANG VE";
  const rows: string[] = [
    centerLine("PHIEU DAT DO"),
    centerLine(subtitle),
    data.ticketLabel ? centerLine(`Phieu ${data.ticketLabel}`) : "",
    ESC_POS_SEPARATOR,
    twoCol(`Gio: ${time}`, `Ngay: ${date}`),
    `Nhan vien: ${plainLine(staff || data.customerName || "-", 30)}`,
    `So thu tu: #${data.orderNumber}`,
    ESC_POS_SEPARATOR,
  ].filter(Boolean);

  for (const item of data.items) {
    rows.push(`${item.quantity} x ${plainLine(item.name, 30)} ${plainLine(item.unit || "", 4)}`);
    if (item.notes) rows.push(`  * ${plainLine(item.notes, 36)}`);
  }

  if (data.notes) rows.push(ESC_POS_SEPARATOR, `Ghi chu: ${plainLine(data.notes, 34)}`);
  rows.push(ESC_POS_SEPARATOR, centerLine("Toda Cafe"));
  return buildEscPos(rows);
}

function buildReceiptEscPos(data: ReceiptTicketData, cfg: ReceiptConfig = DEFAULT_RECEIPT_CONFIG): number[] {
  const SEP = separatorLine(cfg.separator);
  const footers = cfg.footerLines ?? ["Cam on quy khach!"];
  const rows: Array<string | number[]> = [];

  // Khoảng trắng đầu phiếu để kẹp vào thanh/gai hóa đơn
  for (let i = 0; i < cfg.topFeedLines; i++) rows.push(" ");

  rows.push(
    centerLine(data.businessName),
    ...cfg.headerLines.map((l) => centerLine(l)),
    cfg.show.address && data.address ? centerLine(data.address) : "",
    cfg.show.phone && data.phone ? centerLine(`DT: ${data.phone}`) : "",
    SEP,
    centerLine("HOA DON"),
    `Don hang: #${data.orderNumber}`,
    formatDateTime(data.createdAt),
    cfg.show.customer && data.customerName ? `Khach: ${plainLine(data.customerName, 34)}` : "",
    SEP,
  );

  for (const item of data.items) {
    rows.push(twoCol(`${item.quantity}x ${plainLine(item.name, 26)}`, moneyPlain(item.total)));
  }

  rows.push(
    SEP,
    twoCol("Tam tinh", moneyPlain(data.subtotal)),
    cfg.show.vat ? twoCol("VAT", moneyPlain(data.tax)) : "",
    twoCol("TONG CONG", moneyPlain(data.total)),
    cfg.show.paymentMethod && data.paymentMethod ? `Thanh toan: ${plainLine(data.paymentMethod, 28)}` : "",
    SEP,
    ...footers.map((l) => centerLine(l)),
  );
  return buildEscPos(rows.filter((r) => r !== ""));
}

// ---------------------------------------------------------------------------
// In tiếng Việt CÓ DẤU: render hóa đơn thành ảnh đen trắng trên canvas rồi gửi
// lệnh raster GS v 0 — máy in nhiệt nào cũng in được ảnh, không phụ thuộc
// codepage tiếng Việt của máy (thứ mà ESC/POS text thô không có).
// ---------------------------------------------------------------------------

type RasterSeg =
  | { kind: "text"; text: string; align?: "left" | "center"; bold?: boolean; big?: boolean }
  | { kind: "twoCol"; left: string; right: string; bold?: boolean; big?: boolean }
  | { kind: "sep" }
  | { kind: "space" };

function moneyVi(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("vi-VN")}đ`;
}

function receiptRasterSegments(data: ReceiptTicketData, cfg: ReceiptConfig): RasterSeg[] {
  const footers = cfg.footerLines ?? ["Cảm ơn quý khách và Hẹn gặp lại!"];
  const segs: RasterSeg[] = [
    { kind: "text", text: data.businessName, align: "center", bold: true, big: true },
    ...cfg.headerLines.map((l): RasterSeg => ({ kind: "text", text: l, align: "center" })),
  ];
  if (cfg.show.address && data.address) segs.push({ kind: "text", text: data.address, align: "center" });
  if (cfg.show.phone && data.phone) segs.push({ kind: "text", text: `ĐT: ${data.phone}`, align: "center" });
  segs.push({ kind: "sep" });
  segs.push({ kind: "text", text: "HÓA ĐƠN", align: "center", bold: true });
  segs.push({ kind: "text", text: `Đơn hàng: #${data.orderNumber}` });
  segs.push({ kind: "text", text: formatDateTime(data.createdAt) });
  if (cfg.show.customer && data.customerName) segs.push({ kind: "text", text: `Khách: ${data.customerName}` });
  segs.push({ kind: "sep" });
  for (const item of data.items) {
    segs.push({ kind: "twoCol", left: `${item.quantity}x ${item.name}`, right: moneyVi(item.total) });
  }
  segs.push({ kind: "sep" });
  segs.push({ kind: "twoCol", left: "Tạm tính", right: moneyVi(data.subtotal) });
  if (cfg.show.vat) segs.push({ kind: "twoCol", left: "Thuế VAT", right: moneyVi(data.tax) });
  segs.push({ kind: "twoCol", left: "TỔNG CỘNG", right: moneyVi(data.total), bold: true, big: true });
  if (cfg.show.paymentMethod && data.paymentMethod) {
    segs.push({ kind: "text", text: `Thanh toán: ${data.paymentMethod}` });
  }
  segs.push({ kind: "sep" });
  for (const l of footers) segs.push({ kind: "text", text: l, align: "center" });
  return segs;
}

function drawSegmentsToCanvas(segs: RasterSeg[], cfg: ReceiptConfig): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const width = cfg.paper === "58" ? 384 : 576;
  const FONT = 22;
  const FONT_BIG = 30;
  const lineH = (big?: boolean) => Math.round((big ? FONT_BIG : FONT) * 1.45);
  const fontOf = (s: { bold?: boolean; big?: boolean }) =>
    `${s.bold ? "bold " : ""}${s.big ? FONT_BIG : FONT}px 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;

  // Cắt bớt chữ quá dài (giữ 1 dòng/segment cho khớp khổ giấy)
  const fit = (text: string, font: string, maxW: number): string => {
    measure.font = font;
    if (measure.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && measure.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  let height = 8;
  for (const s of segs) {
    if (s.kind === "sep") height += cfg.separator === "none" ? 6 : 14;
    else if (s.kind === "space") height += FONT;
    else height += lineH((s as any).big);
  }
  height += 8;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  let y = 8;
  for (const s of segs) {
    if (s.kind === "sep") {
      if (cfg.separator !== "none") {
        const mid = y + 6;
        ctx.save();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = cfg.separator === "double" ? 1 : 2;
        if (cfg.separator === "dashed" || cfg.separator === "stars") ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(width, mid);
        if (cfg.separator === "double") {
          ctx.moveTo(0, mid + 4);
          ctx.lineTo(width, mid + 4);
        }
        ctx.stroke();
        ctx.restore();
        y += 14;
      } else {
        y += 6;
      }
      continue;
    }
    if (s.kind === "space") {
      y += FONT;
      continue;
    }
    const font = fontOf(s);
    ctx.font = font;
    if (s.kind === "twoCol") {
      const rightW = ctx.measureText(s.right).width;
      const left = fit(s.left, font, width - rightW - 12);
      ctx.textAlign = "left";
      ctx.fillText(left, 0, y);
      ctx.textAlign = "right";
      ctx.fillText(s.right, width, y);
    } else {
      const text = fit(s.text, font, width);
      if (s.align === "center") {
        ctx.textAlign = "center";
        ctx.fillText(text, width / 2, y);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(text, 0, y);
      }
    }
    y += lineH((s as any).big);
  }
  return canvas;
}

function canvasToEscPosRaster(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const out: number[] = [];
  const CHUNK_ROWS = 240; // chia block nhỏ tránh tràn buffer máy in

  for (let y0 = 0; y0 < height; y0 += CHUNK_ROWS) {
    const rows = Math.min(CHUNK_ROWS, height - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff);
    for (let y = y0; y < y0 + rows; y++) {
      for (let xb = 0; xb < bytesPerRow; xb++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          if (x >= width) continue;
          const i = (y * width + x) * 4;
          const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          if (img[i + 3] > 128 && lum < 160) byte |= 0x80 >> bit;
        }
        out.push(byte);
      }
    }
  }
  return out;
}

function buildReceiptRasterEscPos(data: ReceiptTicketData, cfg: ReceiptConfig): number[] | null {
  const canvas = drawSegmentsToCanvas(receiptRasterSegments(data, cfg), cfg);
  if (!canvas) return null;
  const raster = canvasToEscPosRaster(canvas);
  if (!raster.length) return null;
  const bytes: number[] = [0x1b, 0x40];
  for (let i = 0; i < cfg.topFeedLines; i++) bytes.push(0x0a);
  bytes.push(...raster);
  bytes.push(0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
  return bytes;
}

function buildTemporaryTransferEscPos(data: TemporaryTransferBillData): number[] {
  const expires = new Date(data.expiresAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const rows: Array<string | number[]> = [
    centerLine(data.businessName),
    data.address ? centerLine(data.address) : "",
    ESC_POS_SEPARATOR,
    centerLine("PHIEU TAM TINH"),
    `Don: #${data.orderNumber}`,
    data.tableNumber ? `Ban: ${data.tableNumber}` : "",
    data.customerName ? `Khach: ${plainLine(data.customerName, 34)}` : "",
    ESC_POS_SEPARATOR,
  ].filter(Boolean);

  for (const item of data.items) {
    rows.push(twoCol(`${item.quantity}x ${plainLine(item.name, 26)}`, moneyPlain(item.total)));
  }

  rows.push(
    ESC_POS_SEPARATOR,
    twoCol("Tam tinh", moneyPlain(data.subtotal)),
    twoCol("VAT", moneyPlain(data.tax)),
    twoCol("TONG CAN TRA", moneyPlain(data.total)),
    ESC_POS_SEPARATOR,
    centerLine("QUET QR CHUYEN KHOAN"),
    escposAlign("center"),
    escposQrBytes(data.qrPayload || data.paymentCode),
    escposAlign("left"),
    data.bank?.accountName ? `Nguoi nhan: ${plainLine(data.bank.accountName, 30)}` : "",
    data.bank?.bankCode ? `Ngan hang: ${plainLine(data.bank.bankCode, 30)}` : "",
    data.bank?.accountNumber ? `STK: ${plainLine(data.bank.accountNumber, 34)}` : "",
    `Noi dung: ${data.paymentCode}`,
    `Hieu luc den: ${expires}`,
    "Ma qua han vui long xin phieu moi.",
  );
  return buildEscPos(rows.filter(Boolean));
}

function formatCents(cents: number): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }

  const value = cents / 100;
  return new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }
  return d.toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const receiptTranslations = {
  vi: {
    kitchenTitle: "COCINA (NHÀ BẾP)",
    ticket: "Phiếu",
    table: "Bàn",
    takeaway: "Mang về",
    customer: "Khách hàng",
    note: "Ghi chú",
    endOfTicket: "FIN TICKET (HẾT HÓA ĐƠN)",
    retailReceipt: "HÓA ĐƠN BÁN LẺ",
    electronicReceipt: "HÓA ĐƠN BÁN LẺ ĐIỆN TỬ",
    invoice: "HÓA ĐƠN VAT",
    order: "Đơn hàng",
    dni: "DNI/CCCD",
    ruc: "Mã số thuế",
    holder: "Đơn vị/Cá nhân",
    subtotal: "Tạm tính:",
    tax: "Thuế VAT:",
    total: "TỔNG CỘNG:",
    paymentMethod: "Phương thức thanh toán:",
    thanks: "Cảm ơn quý khách và Hẹn gặp lại!",
    cash: "Tiền mặt",
    card: "Thẻ",
    yape: "QR ngân hàng",
    plin: "Ví điện tử",
    transfer: "Chuyển khoản",
    other: "Khác",
  },
  en: {
    kitchenTitle: "KITCHEN",
    ticket: "Ticket",
    table: "Table",
    takeaway: "Takeaway",
    customer: "Customer",
    note: "Note",
    endOfTicket: "*** END OF TICKET ***",
    retailReceipt: "RETAIL RECEIPT",
    electronicReceipt: "ELECTRONIC RECEIPT",
    invoice: "TAX INVOICE",
    order: "Order",
    dni: "ID/CCCD No",
    ruc: "Tax ID",
    holder: "Company/Holder Name",
    subtotal: "Subtotal:",
    tax: "Tax (VAT):",
    total: "TOTAL:",
    paymentMethod: "Payment Method:",
    thanks: "Thank you for your business!",
    cash: "Cash",
    card: "Card",
    yape: "Bank QR",
    plin: "E-wallet",
    transfer: "Bank Transfer",
    other: "Other",
  }
};

function buildKitchenTicketHtml(data: KitchenTicketData): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }
  const t = receiptTranslations[lang === "vi" ? "vi" : "en"];
  const isVi = lang === "vi";

  const { time, date } = vnTimeParts(data.createdAt);
  const staff = currentStaffName();
  const subtitle = data.tableNumber
    ? `${(isVi ? "BÀN" : "TABLE")} ${data.tableNumber}`
    : t.takeaway.toUpperCase();

  const rowsHtml = data.items
    .map((item) => {
      const note = item.notes ? `<div class="sub">* ${escapeHtml(item.notes)}</div>` : "";
      return `<tr>
        <td class="c">${item.quantity}</td>
        <td>${escapeHtml(item.name)}${note}</td>
        <td class="c">${escapeHtml(item.unit || "")}</td>
      </tr>`;
    })
    .join("");

  const L = {
    title: isVi ? "PHIẾU ĐẶT ĐỒ" : "ORDER TICKET",
    time: isVi ? "Giờ" : "Time",
    date: isVi ? "Ngày" : "Date",
    staff: isVi ? "Nhân viên" : "Staff",
    no: isVi ? "Số thứ tự" : "No.",
    sl: isVi ? "SL" : "Qty",
    item: isVi ? "Tên món" : "Item",
    unit: isVi ? "ĐVT" : "Unit",
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${L.title} - #${data.orderNumber}</title>
  <style>
    ${thermalStyles(80)}
    .ticket-title { font-size: 18px; font-weight: 800; text-align: center; letter-spacing: 1px; }
    .ticket-sub { font-size: 14px; font-weight: 700; text-align: center; margin-top: 2px; }
    .meta { width: 100%; margin: 6px 0 4px; font-size: 12px; }
    .meta td { padding: 1px 0; vertical-align: top; }
    .items { width: 100%; border-collapse: collapse; margin-top: 2px; }
    .items th, .items td { border: 1px solid #000; padding: 4px 5px; font-size: 12px; vertical-align: top; }
    .items th { font-weight: 700; }
    .items .c { text-align: center; white-space: nowrap; }
    .items .sub { font-size: 10px; color: #444; font-style: italic; margin-top: 1px; }
    .note { font-size: 11px; color: #555; font-style: italic; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="ticket-title">${L.title}</div>
  <div class="ticket-sub">${subtitle}</div>
  ${data.ticketLabel ? `<div class="center bold" style="font-size:12px;margin-top:2px;">${t.ticket} ${data.ticketLabel}</div>` : ""}
  <table class="meta">
    <tr>
      <td><b>${L.time}:</b> ${time}</td>
      <td><b>${L.date}:</b> ${date}</td>
    </tr>
    <tr>
      <td><b>${L.staff}:</b> ${escapeHtml(staff || (data.customerName || "-"))}</td>
      <td><b>${L.no}:</b> #${data.orderNumber}</td>
    </tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:30px;">${L.sl}</th>
        <th style="text-align:left;">${L.item}</th>
        <th class="c" style="width:46px;">${L.unit}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${data.notes ? `<div class="note">${escapeHtml(data.notes)}</div>` : ""}
  <div class="center" style="font-size:11px;font-weight:700;margin-top:8px;">Toda Café</div>
</body>
</html>`;
}

function thermalStyles(widthMm: number = 80): string {
  const contentWidth = widthMm - 4;
  return `
    @page { size: ${widthMm}mm auto; margin: 0; padding: 0; }
    @media print {
      html, body { width: ${widthMm}mm !important; margin: 0 !important; padding: 1mm 2mm !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${contentWidth}mm; margin: 0; padding: 1mm 2mm; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; line-height: 1.3; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
  `;
}

function buildReceiptTicketHtml(data: ReceiptTicketData, cfg: ReceiptConfig = DEFAULT_RECEIPT_CONFIG): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }
  const t = receiptTranslations[lang === "vi" ? "vi" : "en"];
  const sepStyle =
    cfg.separator === "none" ? "border-top:none;height:3px;"
    : cfg.separator === "solid" ? "border-top:1px solid #000;"
    : cfg.separator === "double" ? "border-top:3px double #000;"
    : cfg.separator === "stars" ? "border-top:1px dotted #000;"
    : "border-top:1px dashed #000;";

  const itemsHtml = data.items
    .map(
      (item) =>
        `<tr>
          <td style="text-align:left;padding:1px 0;">${item.quantity}x ${item.name}</td>
          <td style="text-align:right;padding:1px 0;white-space:nowrap;">${formatCents(item.total)}</td>
        </tr>`
    )
    .join("");

  // Determine document title and customer info based on docType
  let docTitle = t.retailReceipt;
  let docInfoHtml = "";
  if (data.docType === "boleta_electronica") {
    docTitle = t.electronicReceipt;
    if (data.docNumber) {
      docInfoHtml = `<div>${t.dni}: ${data.docNumber}</div>`;
    }
    if (data.customerName) {
      docInfoHtml += `<div>${t.customer}: ${data.customerName}</div>`;
    }
  } else if (data.docType === "factura") {
    docTitle = t.invoice;
    if (data.docNumber) {
      docInfoHtml = `<div>${t.ruc}: ${data.docNumber}</div>`;
    }
    if (data.docHolderName) {
      docInfoHtml += `<div>${t.holder}: ${data.docHolderName}</div>`;
    }
  } else {
    // boleta_simple or default
    if (data.customerName) {
      docInfoHtml = `<div>${t.customer}: ${data.customerName}</div>`;
    }
  }

  const methodLabel = data.paymentMethod ? t[data.paymentMethod as keyof typeof t] || data.paymentMethod : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle} - #${data.orderNumber}</title>
  <style>
    ${thermalStyles(cfg.paper === "58" ? 58 : 80)}
    .divider { ${sepStyle} margin: 3px 0; }
    .totals td { padding: 1px 0; }
  </style>
</head>
<body>
  <div style="height:${cfg.topFeedLines * 4}mm;"></div>
  <div class="center bold" style="font-size:14px;">${data.businessName}</div>
  ${cfg.headerLines.map((l) => `<div class="center" style="font-size:10px;">${escapeHtml(l)}</div>`).join("")}
  ${data.ruc ? `<div class="center" style="font-size:10px;">${t.ruc}: ${data.ruc}</div>` : ""}
  ${cfg.show.address && data.address ? `<div class="center" style="font-size:10px;">${data.address}</div>` : ""}
  ${cfg.show.phone && data.phone ? `<div class="center" style="font-size:10px;">ĐT: ${escapeHtml(data.phone)}</div>` : ""}
  <div class="divider"></div>
  <div class="center bold">${docTitle}</div>
  <div class="center" style="font-size:10px;">${formatDateTime(data.createdAt)}</div>
  <div class="center">${t.order}: #${data.orderNumber}</div>
  ${cfg.show.customer ? docInfoHtml : ""}
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr>
      <td>${t.subtotal}</td>
      <td style="text-align:right;">${formatCents(data.subtotal)}</td>
    </tr>
    ${cfg.show.vat ? `<tr>
      <td>${t.tax}</td>
      <td style="text-align:right;">${formatCents(data.tax)}</td>
    </tr>` : ""}
    <tr class="bold">
      <td style="font-size:13px;padding-top:2px;">${t.total}</td>
      <td style="text-align:right;font-size:13px;font-weight:bold;padding-top:2px;">${formatCents(data.total)}</td>
    </tr>
  </table>
  <div class="divider"></div>
  ${cfg.show.paymentMethod && data.paymentMethod ? `<div>${t.paymentMethod} ${methodLabel}</div>` : ""}
  <div class="divider"></div>
  ${(cfg.footerLines ?? [t.thanks]).map((l) => `<div class="center" style="font-size:10px;margin-top:4px;">${escapeHtml(l)}</div>`).join("")}
  <div class="center" style="font-size:9px;">${t.endOfTicket}</div>
</body>
</html>`;
}

function buildTemporaryTransferBillHtml(data: TemporaryTransferBillData): string {
  const itemsHtml = data.items
    .map(
      (item) =>
        `<tr>
          <td style="text-align:left;padding:1px 0;">${item.quantity}x ${escapeHtml(item.name)}</td>
          <td style="text-align:right;padding:1px 0;white-space:nowrap;">${formatCents(item.total)}</td>
        </tr>`,
    )
    .join("");
  const expires = new Date(data.expiresAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Phiếu tạm tính #${data.orderNumber}</title>
  <style>
    ${thermalStyles(80)}
    .totals td { padding: 1px 0; }
    .qr { width: 42mm; height: 42mm; object-fit: contain; margin: 4px auto; display: block; }
    .box { border: 1px solid #000; padding: 4px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;">${escapeHtml(data.businessName)}</div>
  ${data.address ? `<div class="center" style="font-size:10px;">${escapeHtml(data.address)}</div>` : ""}
  <div class="divider"></div>
  <div class="center bold" style="font-size:15px;">PHIẾU TẠM TÍNH</div>
  <div class="center" style="font-size:10px;">${formatDateTime(data.createdAt)}</div>
  <div class="center">Đơn: #${escapeHtml(data.orderNumber)}</div>
  ${data.tableNumber ? `<div class="center bold">Bàn: ${escapeHtml(String(data.tableNumber))}</div>` : ""}
  ${data.customerName ? `<div>Khách: ${escapeHtml(data.customerName)}</div>` : ""}
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr><td>Tạm tính:</td><td style="text-align:right;">${formatCents(data.subtotal)}</td></tr>
    <tr><td>VAT:</td><td style="text-align:right;">${formatCents(data.tax)}</td></tr>
    <tr class="bold"><td style="font-size:14px;">TỔNG CẦN TRẢ:</td><td style="text-align:right;font-size:14px;">${formatCents(data.total)}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="center bold">QUÉT QR CHUYỂN KHOẢN</div>
  ${data.qrUrl ? `<img class="qr" src="${escapeHtml(data.qrUrl)}" />` : `<div class="box center">${escapeHtml(data.qrPayload)}</div>`}
  <div class="box">
    ${data.bank?.accountName ? `<div><b>Người nhận:</b> ${escapeHtml(data.bank.accountName)}</div>` : ""}
    ${data.bank?.bankCode ? `<div><b>Ngân hàng:</b> ${escapeHtml(data.bank.bankCode)}</div>` : ""}
    ${data.bank?.accountNumber ? `<div><b>STK:</b> ${escapeHtml(data.bank.accountNumber)}</div>` : ""}
    <div><b>Nội dung:</b> ${escapeHtml(data.paymentCode)}</div>
    <div><b>Hiệu lực đến:</b> ${expires}</div>
  </div>
  <div class="center" style="font-size:10px;margin-top:4px;">Mã quá hạn vui lòng xin phiếu mới.</div>
</body>
</html>`;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function currentPrintDriver(branchSettings: any): PrintDriver {
  const driver = branchSettings?.settings?.print_driver;
  if (driver === "rawbt_intent" || driver === "android_bridge") return driver;
  return "browser_print";
}

async function printEscPosWithBridge(bytes: number[]): Promise<boolean> {
  const base64 = bytesToBase64(bytes);
  const bridge = (window as any).TodaPrintBridge || (window as any).AndroidPrintBridge;
  if (bridge?.printBase64) {
    bridge.printBase64(base64);
    return true;
  }
  if (bridge?.print) {
    bridge.print(JSON.stringify({ encoding: "base64", format: "escpos", data: base64 }));
    return true;
  }

  // Local print bridge (cổng 18180) — có timeout để KHÔNG treo nếu không có bridge.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("http://127.0.0.1:18180/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encoding: "base64", format: "escpos", data: base64 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return true;
  } catch {
    // Không có bridge → trả về false để caller tự lùi về in trình duyệt.
  }
  return false;
}

function printEscPosWithRawBt(bytes: number[]): Promise<void> {
  return new Promise((resolve) => {
    const base64 = bytesToBase64(bytes);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `rawbt:base64,${encodeURIComponent(base64)}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      iframe.remove();
      resolve();
    }, 900);
  });
}

async function printEscPos(bytes: number[], driver: PrintDriver): Promise<boolean> {
  if (driver === "android_bridge") {
    return await printEscPosWithBridge(bytes);
  }
  if (driver === "rawbt_intent") {
    if (!isAndroid()) return false;
    await printEscPosWithRawBt(bytes);
    return true;
  }
  return false;
}

/**
 * Android Chrome bỏ qua lệnh in từ iframe ẩn và in TRANG CHA thay thế
 * (đó là lý do RawBT từng in ra màn hình app + popup thông báo).
 * Cách chuẩn trên Android: chèn phiếu vào chính document + @media print
 * chỉ hiện phiếu, ẩn toàn bộ app, rồi window.print() ở top-level.
 */
function printHtmlAndroid(html: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const styleText = Array.from(parsed.querySelectorAll("style"))
      .map((s) => s.textContent || "")
      .join("\n");
    const bodyHtml = parsed.body?.innerHTML || "";

    const root = document.createElement("div");
    root.id = "toda-print-root";
    root.innerHTML = bodyHtml;

    const style = document.createElement("style");
    style.id = "toda-print-style";
    style.textContent = `
      #toda-print-root { display: none; }
      @media print {
        body > *:not(#toda-print-root) { display: none !important; }
        #toda-print-root { display: block !important; }
        ${styleText.replace(/html,\s*body|body/g, "#toda-print-root")}
      }
    `;

    document.body.appendChild(root);
    document.head.appendChild(style);

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        root.remove();
        style.remove();
        resolve();
      }, 800);
    }, 150);
  });
}

function printHtml(html: string): Promise<void> {
  if (isAndroid()) {
    return printHtmlAndroid(html);
  }
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-10000px";
    iframe.style.left = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve();
        }, 1000);
      }, 250);
    };
  });
}

/**
 * Prints multiple tickets one after another. Each ticket must finish
 * (iframe.print + cleanup) before the next opens, otherwise the browser
 * may merge or drop print jobs.
 */
async function printHtmlSequential(htmls: string[]): Promise<void> {
  for (const html of htmls) {
    await printHtml(html);
  }
}

/**
 * Kitchen ticket printer.
 * - "combined" (default): one ticket containing every item.
 * - "per_item": one ticket per line item (e.g. 3 món -> 3 phiếu), each
 *   labelled "1/3", "2/3"... and printed sequentially.
 */
export function usePrintKitchenTicket() {
  const { data: branchSettings } = useBranchSettings();
  return useCallback(async (data: KitchenTicketData, mode: PrintMode = "combined") => {
    const driver = currentPrintDriver(branchSettings);
    const tickets =
      mode === "per_item" && data.items.length > 1
        ? data.items.map((item, idx) => ({
            ...data,
            items: [item],
            ticketLabel: `${idx + 1}/${data.items.length}`,
          }))
        : [data];

    // Thử in qua ESC/POS (RawBT / bridge). Nếu MỌI phiếu in ok thì xong;
    // nếu lỗi/không có driver → tự lùi về in trình duyệt cho cả lô.
    if (driver !== "browser_print") {
      let allOk = true;
      for (const ticket of tickets) {
        if (!(await printEscPos(buildKitchenEscPos(ticket), driver))) {
          allOk = false;
          break;
        }
      }
      if (allOk) return;
    }
    await printHtmlSequential(tickets.map((ticket) => buildKitchenTicketHtml(ticket)));
  }, [branchSettings]);
}

export function usePrintReceipt() {
  const { data: branchSettings } = useBranchSettings();
  return useCallback(async (data: ReceiptTicketData) => {
    const driver = currentPrintDriver(branchSettings);
    const cfg = getReceiptConfig(branchSettings);
    // Bổ sung địa chỉ/SĐT từ cấu hình chi nhánh nếu caller chưa truyền
    const enriched: ReceiptTicketData = {
      ...data,
      address: data.address ?? branchSettings?.address ?? undefined,
      phone: data.phone ?? branchSettings?.phone ?? undefined,
    };
    if (driver !== "browser_print") {
      const bytes = cfg.utf8Bitmap
        ? buildReceiptRasterEscPos(enriched, cfg) ?? buildReceiptEscPos(enriched, cfg)
        : buildReceiptEscPos(enriched, cfg);
      if (await printEscPos(bytes, driver)) return;
    }
    const html = buildReceiptTicketHtml(enriched, cfg);
    printHtml(html);
  }, [branchSettings]);
}

export function usePrintTemporaryTransferBill() {
  const { data: branchSettings } = useBranchSettings();
  return useCallback(async (data: TemporaryTransferBillData) => {
    const driver = currentPrintDriver(branchSettings);
    if (driver !== "browser_print") {
      if (await printEscPos(buildTemporaryTransferEscPos(data), driver)) return;
    }
    const html = buildTemporaryTransferBillHtml(data);
    printHtml(html);
  }, [branchSettings]);
}

export interface ShiftReportData {
  businessName: string;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  cashSales: number;
  totalSales: number;
  orderCount: number;
  expectedCash: number;
  closingCash: number;
  difference: number;
  byMethod: Record<string, number>;
}

function methodLabelVi(method: string): string {
  const map: Record<string, string> = {
    cash: "Tiền mặt",
    card: "Thẻ",
    transfer: "Chuyển khoản",
    yape: "QR ngân hàng",
    plin: "Ví điện tử",
    other: "Khác",
  };
  return map[method] || method;
}

function buildShiftReportHtml(data: ShiftReportData): string {
  const methodRows = Object.entries(data.byMethod)
    .map(
      ([m, amt]) =>
        `<tr><td style="text-align:left;padding:1px 0;">${methodLabelVi(m)}</td><td style="text-align:right;padding:1px 0;">${formatCents(amt)}</td></tr>`,
    )
    .join("");

  const diffLabel = data.difference === 0 ? "Khớp" : data.difference > 0 ? "Thừa" : "Thiếu";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Phiếu cuối ca</title>
  <style>
    ${thermalStyles(80)}
    .totals td { padding: 1px 0; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;">${escapeHtml(data.businessName)}</div>
  <div class="center bold" style="font-size:15px;margin-top:2px;">PHIẾU CUỐI CA</div>
  <div class="divider"></div>
  <div style="font-size:11px;">Mở ca: ${formatDateTime(data.openedAt)}</div>
  <div style="font-size:11px;">Đóng ca: ${formatDateTime(data.closedAt)}</div>
  <div class="divider"></div>
  <div class="center bold">DOANH THU THEO PHƯƠNG THỨC</div>
  <table>${methodRows || `<tr><td>Chưa có giao dịch</td><td></td></tr>`}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr><td>Số đơn:</td><td style="text-align:right;">${data.orderCount}</td></tr>
    <tr class="bold"><td>Tổng doanh thu:</td><td style="text-align:right;">${formatCents(data.totalSales)}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="center bold">ĐỐI SOÁT TIỀN MẶT</div>
  <table class="totals">
    <tr><td>Tiền đầu ca:</td><td style="text-align:right;">${formatCents(data.openingCash)}</td></tr>
    <tr><td>Thu tiền mặt:</td><td style="text-align:right;">${formatCents(data.cashSales)}</td></tr>
    <tr><td>Kỳ vọng:</td><td style="text-align:right;">${formatCents(data.expectedCash)}</td></tr>
    <tr><td>Đếm thực tế:</td><td style="text-align:right;">${formatCents(data.closingCash)}</td></tr>
    <tr class="bold"><td>Chênh lệch (${diffLabel}):</td><td style="text-align:right;">${formatCents(data.difference)}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="center" style="font-size:10px;margin-top:4px;">Toda Café</div>
</body>
</html>`;
}

export function usePrintShiftReport() {
  return useCallback((data: ShiftReportData) => {
    printHtml(buildShiftReportHtml(data));
  }, []);
}
