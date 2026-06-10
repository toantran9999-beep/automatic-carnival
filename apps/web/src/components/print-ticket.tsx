"use client";

import { useRef, useCallback } from "react";
import { useLangStore } from "@/stores/lang-store";

interface OrderItem {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
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

  const itemsHtml = data.items
    .map(
      (item) =>
        `<tr>
          <td style="text-align:left;padding:2px 0;">${item.quantity}x ${item.name}${item.notes ? `<br><span style="font-size:10px;color:#666;">* ${item.notes}</span>` : ""}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Phiếu bếp - #${data.orderNumber}</title>
  <style>
    ${thermalStyles(80)}
    .order-num { font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 2px; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;">${t.kitchenTitle}</div>
  <div class="divider"></div>
  <div class="order-num">#${data.orderNumber}</div>
  ${data.ticketLabel ? `<div class="center bold" style="font-size:13px;">${t.ticket} ${data.ticketLabel}</div>` : ""}
  <div class="divider"></div>
  <table>
    <tr>
      <td>${data.tableNumber ? `${t.table}: ${data.tableNumber}` : t.takeaway}</td>
      <td style="text-align:right;">${formatDateTime(data.createdAt)}</td>
    </tr>
    ${data.customerName ? `<tr><td colspan="2">${t.customer}: ${data.customerName}</td></tr>` : ""}
  </table>
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  ${data.notes ? `<div class="divider"></div><div style="font-size:11px;">${t.note}: ${data.notes}</div>` : ""}
  <div class="divider"></div>
  <div class="center" style="font-size:10px;margin-top:4px;">${t.endOfTicket}</div>
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

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
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
  return useCallback(async (data: KitchenTicketData, mode: PrintMode = "combined") => {
    if (mode === "per_item" && data.items.length > 1) {
      const total = data.items.length;
      const htmls = data.items.map((item, idx) =>
        buildKitchenTicketHtml({
          ...data,
          items: [item],
          ticketLabel: `${idx + 1}/${total}`,
        }),
      );
      await printHtmlSequential(htmls);
      return;
    }
    await printHtml(buildKitchenTicketHtml(data));
  }, []);
}

export function usePrintReceipt() {
  return useCallback((data: ReceiptTicketData) => {
    const html = buildReceiptTicketHtml(data);
    printHtml(html);
  }, []);
}
