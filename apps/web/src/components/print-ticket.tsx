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

interface ReceiptTicketData {
  businessName: string;
  ruc?: string;
  address?: string;
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

function plainLine(value = "", width = 42): string {
  const clean = removeVietnameseMarks(value).replace(/\s+/g, " ").trim();
  return clean.length > width ? clean.slice(0, width) : clean;
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

function twoCol(left: string, right: string, width = 42): string {
  const l = plainLine(left, width);
  const r = plainLine(right, width);
  return `${l}${" ".repeat(Math.max(1, width - l.length - r.length))}${r}`;
}

function escposQrBytes(value: string): number[] {
  const data = textBytes(value);
  const len = data.length + 3;
  const pL = len % 256;
  const pH = Math.floor(len / 256);
  return [
    0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30,
    ...data,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

function buildEscPos(lines: Array<string | number[]>): number[] {
  const bytes: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x00];
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
    "        PHIEU DAT DO",
    `          ${subtitle}`,
    data.ticketLabel ? `          Phieu ${data.ticketLabel}` : "",
    "------------------------------------------",
    twoCol(`Gio: ${time}`, `Ngay: ${date}`),
    `Nhan vien: ${plainLine(staff || data.customerName || "-", 30)}`,
    `So thu tu: #${data.orderNumber}`,
    "------------------------------------------",
  ].filter(Boolean);

  for (const item of data.items) {
    rows.push(`${item.quantity} x ${plainLine(item.name, 34)} ${plainLine(item.unit || "", 4)}`);
    if (item.notes) rows.push(`  * ${plainLine(item.notes, 36)}`);
  }

  if (data.notes) rows.push("------------------------------------------", `Ghi chu: ${plainLine(data.notes, 34)}`);
  rows.push("------------------------------------------", "              Toda Cafe");
  return buildEscPos(rows);
}

function buildReceiptEscPos(data: ReceiptTicketData): number[] {
  const rows: Array<string | number[]> = [
    `          ${plainLine(data.businessName, 22)}`,
    data.address ? `   ${plainLine(data.address, 36)}` : "",
    "------------------------------------------",
    "              HOA DON",
    `Don hang: #${data.orderNumber}`,
    formatDateTime(data.createdAt),
    data.customerName ? `Khach: ${plainLine(data.customerName, 34)}` : "",
    "------------------------------------------",
  ].filter(Boolean);

  for (const item of data.items) {
    rows.push(twoCol(`${item.quantity}x ${plainLine(item.name, 26)}`, moneyPlain(item.total)));
  }

  rows.push(
    "------------------------------------------",
    twoCol("Tam tinh", moneyPlain(data.subtotal)),
    twoCol("VAT", moneyPlain(data.tax)),
    twoCol("TONG CONG", moneyPlain(data.total)),
    data.paymentMethod ? `Thanh toan: ${plainLine(data.paymentMethod, 28)}` : "",
    "------------------------------------------",
    "        Cam on quy khach!",
  );
  return buildEscPos(rows.filter(Boolean));
}

function buildTemporaryTransferEscPos(data: TemporaryTransferBillData): number[] {
  const expires = new Date(data.expiresAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const rows: Array<string | number[]> = [
    `          ${plainLine(data.businessName, 22)}`,
    data.address ? `   ${plainLine(data.address, 36)}` : "",
    "------------------------------------------",
    "           PHIEU TAM TINH",
    `Don: #${data.orderNumber}`,
    data.tableNumber ? `Ban: ${data.tableNumber}` : "",
    data.customerName ? `Khach: ${plainLine(data.customerName, 34)}` : "",
    "------------------------------------------",
  ].filter(Boolean);

  for (const item of data.items) {
    rows.push(twoCol(`${item.quantity}x ${plainLine(item.name, 26)}`, moneyPlain(item.total)));
  }

  rows.push(
    "------------------------------------------",
    twoCol("Tam tinh", moneyPlain(data.subtotal)),
    twoCol("VAT", moneyPlain(data.tax)),
    twoCol("TONG CAN TRA", moneyPlain(data.total)),
    "------------------------------------------",
    "       QUET QR CHUYEN KHOAN",
    escposQrBytes(data.qrPayload || data.paymentCode),
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

function buildReceiptTicketHtml(data: ReceiptTicketData): string {
  let lang = "vi";
  try {
    lang = useLangStore.getState()?.lang || "vi";
  } catch (e) {
    // Ignore server-side hydration errors
  }
  const t = receiptTranslations[lang === "vi" ? "vi" : "en"];

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
    ${thermalStyles(80)}
    .totals td { padding: 1px 0; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;">${data.businessName}</div>
  ${data.ruc ? `<div class="center" style="font-size:10px;">${t.ruc}: ${data.ruc}</div>` : ""}
  ${data.address ? `<div class="center" style="font-size:10px;">${data.address}</div>` : ""}
  <div class="divider"></div>
  <div class="center bold">${docTitle}</div>
  <div class="center" style="font-size:10px;">${formatDateTime(data.createdAt)}</div>
  <div class="center">${t.order}: #${data.orderNumber}</div>
  ${docInfoHtml}
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr>
      <td>${t.subtotal}</td>
      <td style="text-align:right;">${formatCents(data.subtotal)}</td>
    </tr>
    <tr>
      <td>${t.tax}</td>
      <td style="text-align:right;">${formatCents(data.tax)}</td>
    </tr>
    <tr class="bold">
      <td style="font-size:13px;padding-top:2px;">${t.total}</td>
      <td style="text-align:right;font-size:13px;font-weight:bold;padding-top:2px;">${formatCents(data.total)}</td>
    </tr>
  </table>
  <div class="divider"></div>
  ${data.paymentMethod ? `<div>${t.paymentMethod} ${methodLabel}</div>` : ""}
  <div class="divider"></div>
  <div class="center" style="font-size:10px;margin-top:4px;">${t.thanks}</div>
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

async function printEscPosWithBridge(bytes: number[]): Promise<void> {
  const base64 = bytesToBase64(bytes);
  const bridge = (window as any).TodaPrintBridge || (window as any).AndroidPrintBridge;
  if (bridge?.printBase64) {
    bridge.printBase64(base64);
    return;
  }
  if (bridge?.print) {
    bridge.print(JSON.stringify({ encoding: "base64", format: "escpos", data: base64 }));
    return;
  }

  try {
    const res = await fetch("http://127.0.0.1:18180/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encoding: "base64", format: "escpos", data: base64 }),
    });
    if (res.ok) return;
  } catch {
    // Local bridge is optional; fall through to a clear error.
  }

  throw new Error("Chưa kết nối Android print bridge");
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
    await printEscPosWithBridge(bytes);
    return true;
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
    if (mode === "per_item" && data.items.length > 1) {
      const total = data.items.length;
      const tickets = data.items.map((item, idx) => ({
          ...data,
          items: [item],
          ticketLabel: `${idx + 1}/${total}`,
        }));
      if (driver !== "browser_print") {
        for (const ticket of tickets) {
          if (!(await printEscPos(buildKitchenEscPos(ticket), driver))) break;
        }
        if (driver !== "rawbt_intent" || isAndroid()) return;
      }
      await printHtmlSequential(tickets.map((ticket) => buildKitchenTicketHtml(ticket)));
      return;
    }
    if (driver !== "browser_print") {
      if (await printEscPos(buildKitchenEscPos(data), driver)) return;
    }
    await printHtml(buildKitchenTicketHtml(data));
  }, [branchSettings]);
}

export function usePrintReceipt() {
  const { data: branchSettings } = useBranchSettings();
  return useCallback(async (data: ReceiptTicketData) => {
    const driver = currentPrintDriver(branchSettings);
    if (driver !== "browser_print") {
      if (await printEscPos(buildReceiptEscPos(data), driver)) return;
    }
    const html = buildReceiptTicketHtml(data);
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
