import type { WorkSheet } from "xlsx";
import { addDays, formatVnDate } from "@/lib/vn-date";

/** Dữ liệu `GET /api/reports/export`. Tiền đều là XU (÷100 mới ra đồng). */
export interface ReportExportData {
  startDate: string;
  endDate: string;
  allBranches: boolean;
  branchName: string | null;
  liveDataFrom: string | null;
  orders: {
    id: string;
    order_number: string;
    date: string;
    time: string;
    type: string;
    status: string;
    table_number: string | null;
    created_by_name: string | null;
    branch_name: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    notes: string | null;
    payments: { method: string; amount: number }[];
  }[];
  items: {
    id: string;
    order_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    unit: string | null;
    notes: string | null;
    modifiers: { name: string; price: number }[];
  }[];
  legacyDays: { date: string; orders: number; revenue: number }[];
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
};
const TYPE_LABEL: Record<string, string> = {
  dine_in: "Tại bàn",
  takeout: "Mang về",
  delivery: "Giao hàng",
};
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONEY_FORMAT = "#,##0";

/** Xu → đồng. Mọi ô tiền trong tệp là SỐ (cộng/lọc được trong Excel), không phải chữ. */
const dong = (xu: number) => Math.round(xu) / 100;
const vnd = new Intl.NumberFormat("vi-VN");

const methodKey = (m: string) => (m in METHOD_LABEL ? m : "other");
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

function modifierText(mods: { name: string; price: number }[]): string {
  return mods
    .map((m) => {
      if (!m.price) return m.name;
      const sign = m.price > 0 ? "+" : "−";
      return `${m.name} (${sign}${vnd.format(Math.abs(dong(m.price)))})`;
    })
    .join(", ");
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Dựng và tải về tệp .xlsx gồm các trang:
 * Theo ngày · Đơn hàng · Chi tiết món · Tổng theo món · (Đơn đã hủy nếu có).
 *
 * Nạp thư viện `xlsx` lúc bấm nút (import động) nên trang Báo cáo không nặng thêm.
 */
export async function downloadReportExcel(data: ReportExportData): Promise<string> {
  const XLSX = await import("xlsx");

  const completed = data.orders.filter((o) => o.status === "completed");
  const cancelled = data.orders.filter((o) => o.status === "cancelled");
  const orderById = new Map(data.orders.map((o) => [o.id, o]));
  const showBranch = data.allBranches;

  /** Gắn định dạng tiền cho các cột chỉ định (bỏ qua `skipRows` dòng đầu). */
  const formatMoney = (ws: WorkSheet, cols: number[], skipRows: number) => {
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let r = skipRows; r <= range.e.r; r++) {
      for (const col of cols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
        if (cell && cell.t === "n") cell.z = MONEY_FORMAT;
      }
    }
  };
  const table = (rows: (string | number | null)[][], widths: number[], headerRow = 0) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    // Bộ lọc trên dòng tiêu đề, trừ dòng TỔNG ở cuối.
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: Math.max(headerRow, range.e.r - 1), c: range.e.c } }),
    };
    return ws;
  };

  // ── Trang 1: Theo ngày ────────────────────────────────────────────────
  type DayAcc = { orders: number; revenue: number; cancelled: number; byMethod: Record<string, number>; legacy: boolean };
  const days = new Map<string, DayAcc>();
  for (let d = data.startDate; d <= data.endDate; d = addDays(d, 1)) {
    days.set(d, { orders: 0, revenue: 0, cancelled: 0, byMethod: {}, legacy: false });
  }
  for (const l of data.legacyDays) {
    const acc = days.get(l.date);
    if (!acc) continue;
    acc.orders += l.orders;
    acc.revenue += l.revenue;
    acc.legacy = true;
  }
  for (const o of completed) {
    const acc = days.get(o.date);
    if (!acc) continue;
    acc.orders += 1;
    acc.revenue += o.total;
    for (const p of o.payments) {
      const k = methodKey(p.method);
      acc.byMethod[k] = (acc.byMethod[k] ?? 0) + p.amount;
    }
  }
  for (const o of cancelled) {
    const acc = days.get(o.date);
    if (acc) acc.cancelled += 1;
  }

  const methodCols = ["cash", "transfer", "card", "other"];
  const scopeLabel = data.allBranches ? "Tất cả chi nhánh" : data.branchName ?? "";
  const header: (string | number | null)[][] = [
    ["TODA — Báo cáo bán hàng chi tiết"],
    [`Chi nhánh: ${scopeLabel}`],
    [`Từ ${formatVnDate(data.startDate)} đến ${formatVnDate(data.endDate)} (ngày theo giờ Việt Nam)`],
    ["Doanh thu = tổng các đơn đã thanh toán. Tiền tính bằng đồng."],
  ];
  const hasLegacy = data.legacyDays.length > 0;
  if (hasLegacy && data.liveDataFrom) {
    header.push([
      `Trước ${formatVnDate(data.liveDataFrom)} là số tổng nhập từ POS cũ: không có chi tiết đơn, món và hình thức thanh toán.`,
    ]);
  }
  header.push([]);
  const dayHeaderRow = header.length;
  const dayRows: (string | number | null)[][] = [
    ...header,
    ["Ngày", "Thứ", "Số đơn", "Doanh thu", "Tiền mặt", "Chuyển khoản", "Thẻ", "Khác", "Đơn hủy", "Ghi chú"],
  ];
  const tot = { orders: 0, revenue: 0, cancelled: 0, byMethod: {} as Record<string, number> };
  for (const [date, a] of days) {
    dayRows.push([
      formatVnDate(date),
      weekday(date),
      a.orders,
      dong(a.revenue),
      ...methodCols.map((m) => (a.legacy ? null : dong(a.byMethod[m] ?? 0))),
      a.cancelled,
      a.legacy ? "POS cũ" : a.orders === 0 ? "Không có đơn" : "",
    ]);
    tot.orders += a.orders;
    tot.revenue += a.revenue;
    tot.cancelled += a.cancelled;
    for (const m of methodCols) tot.byMethod[m] = (tot.byMethod[m] ?? 0) + (a.byMethod[m] ?? 0);
  }
  dayRows.push([
    "TỔNG",
    "",
    tot.orders,
    dong(tot.revenue),
    ...methodCols.map((m) => dong(tot.byMethod[m] ?? 0)),
    tot.cancelled,
    "",
  ]);
  const wsDays = table(dayRows, [12, 6, 9, 14, 14, 14, 12, 10, 9, 16], dayHeaderRow);
  formatMoney(wsDays, [3, 4, 5, 6, 7], dayHeaderRow + 1);

  // ── Trang 2: Đơn hàng ─────────────────────────────────────────────────
  const orderHead = [
    ...(showBranch ? ["Chi nhánh"] : []),
    "Ngày", "Giờ", "Số phiếu", "Loại", "Bàn", "Người order", "Thanh toán", "Tạm tính", "Giảm giá", "Tổng", "Ghi chú",
  ];
  const off = showBranch ? 1 : 0;
  const orderRows: (string | number | null)[][] = [orderHead];
  for (const o of completed) {
    orderRows.push([
      ...(showBranch ? [o.branch_name] : []),
      formatVnDate(o.date),
      o.time,
      o.order_number,
      TYPE_LABEL[o.type] ?? o.type,
      o.table_number ?? "",
      o.created_by_name ?? "",
      [...new Set(o.payments.map((p) => METHOD_LABEL[p.method] ?? "Khác"))].join(", "),
      dong(o.subtotal),
      dong(o.discount),
      dong(o.total),
      o.notes ?? "",
    ]);
  }
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  orderRows.push([
    ...(showBranch ? [""] : []),
    "TỔNG", "", `${completed.length} đơn`, "", "", "", "",
    dong(sum(completed.map((o) => o.subtotal))),
    dong(sum(completed.map((o) => o.discount))),
    dong(sum(completed.map((o) => o.total))),
    "",
  ]);
  const wsOrders = table(orderRows, [...(showBranch ? [16] : []), 12, 7, 10, 10, 8, 16, 16, 12, 10, 12, 30]);
  formatMoney(wsOrders, [7 + off, 8 + off, 9 + off], 1);

  // ── Trang 3: Chi tiết món ─────────────────────────────────────────────
  const itemRows: (string | number | null)[][] = [[
    ...(showBranch ? ["Chi nhánh"] : []),
    "Ngày", "Giờ", "Số phiếu", "Món", "Tùy chọn", "SL", "Giá gốc 1 món", "Thành tiền", "Ghi chú món",
  ]];
  for (const i of data.items) {
    const o = orderById.get(i.order_id);
    if (!o) continue;
    itemRows.push([
      ...(showBranch ? [o.branch_name] : []),
      formatVnDate(o.date),
      o.time,
      o.order_number,
      i.name,
      modifierText(i.modifiers),
      i.quantity,
      dong(i.unit_price),
      dong(i.total),
      i.notes ?? "",
    ]);
  }
  itemRows.push([
    ...(showBranch ? [""] : []),
    "TỔNG", "", "", "", "",
    sum(data.items.map((i) => i.quantity)),
    "",
    dong(sum(data.items.map((i) => i.total))),
    "",
  ]);
  const wsItems = table(itemRows, [...(showBranch ? [16] : []), 12, 7, 10, 26, 34, 6, 13, 12, 24]);
  formatMoney(wsItems, [6 + off, 7 + off], 1);

  // ── Trang 4: Tổng theo món ────────────────────────────────────────────
  const byName = new Map<string, { qty: number; revenue: number }>();
  for (const i of data.items) {
    const acc = byName.get(i.name) ?? { qty: 0, revenue: 0 };
    acc.qty += i.quantity;
    acc.revenue += i.total;
    byName.set(i.name, acc);
  }
  const itemsRevenue = sum([...byName.values()].map((a) => a.revenue));
  const summaryRows: (string | number | null)[][] = [["Món", "Số lượng", "Doanh thu", "% doanh thu"]];
  for (const [name, a] of [...byName.entries()].sort((x, y) => y[1].revenue - x[1].revenue)) {
    summaryRows.push([
      name,
      a.qty,
      dong(a.revenue),
      itemsRevenue > 0 ? Math.round((a.revenue / itemsRevenue) * 1000) / 10 : 0,
    ]);
  }
  summaryRows.push(["TỔNG", sum([...byName.values()].map((a) => a.qty)), dong(itemsRevenue), 100]);
  const wsSummary = table(summaryRows, [30, 10, 14, 12]);
  formatMoney(wsSummary, [2], 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDays, "Theo ngày");
  XLSX.utils.book_append_sheet(wb, wsOrders, "Đơn hàng");
  XLSX.utils.book_append_sheet(wb, wsItems, "Chi tiết món");
  XLSX.utils.book_append_sheet(wb, wsSummary, "Tổng theo món");

  // ── Trang 5: Đơn đã hủy (chỉ khi có) — để soi lại, không cộng vào doanh thu ──
  if (cancelled.length > 0) {
    const rows: (string | number | null)[][] = [[
      ...(showBranch ? ["Chi nhánh"] : []),
      "Ngày", "Giờ", "Số phiếu", "Loại", "Bàn", "Người order", "Tổng", "Ghi chú",
    ]];
    for (const o of cancelled) {
      rows.push([
        ...(showBranch ? [o.branch_name] : []),
        formatVnDate(o.date),
        o.time,
        o.order_number,
        TYPE_LABEL[o.type] ?? o.type,
        o.table_number ?? "",
        o.created_by_name ?? "",
        dong(o.total),
        o.notes ?? "",
      ]);
    }
    rows.push([...(showBranch ? [""] : []), "TỔNG", "", `${cancelled.length} đơn`, "", "", "", dong(sum(cancelled.map((o) => o.total))), ""]);
    const ws = table(rows, [...(showBranch ? [16] : []), 12, 7, 10, 10, 8, 16, 12, 30]);
    formatMoney(ws, [6 + off], 1);
    XLSX.utils.book_append_sheet(wb, ws, "Đơn đã hủy");
  }

  const scope = data.allBranches ? "tat-ca-chi-nhanh" : asciiSlug(data.branchName ?? "chi-nhanh");
  const fileName = `TODA-bao-cao_${scope}_${data.startDate}_${data.endDate}.xlsx`;
  XLSX.writeFile(wb, fileName, { compression: true });
  return fileName;
}
