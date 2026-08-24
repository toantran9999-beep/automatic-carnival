"use client";

import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

/**
 * Dòng tự đối chiếu "tiền đã thu" với "doanh thu đơn", và khối cảnh báo khi lệch.
 *
 * Hai con số này PHẢI bằng nhau: tổng các khoản thu của một tập đơn đã hoàn tất
 * chính là tổng tiền của tập đơn đó. Có dòng này thì bảng TỰ chứng minh mình
 * đúng, chủ quán khỏi phải cộng nhẩm mới phát hiện ra chuyện.
 *
 * ⚠️ Ra đời sau vụ 24/08/2026: Bảng điều khiển hiện doanh thu 2.917.000đ trong khi
 * vòng tròn thanh toán cộng ra 3.050.000đ — 6 đơn chuyển khoản bị ghi thu hai lần.
 * Hai con số đá nhau nằm cạnh nhau suốt nhiều ngày mà không có gì báo động.
 *
 * Dùng chung cho trang Báo cáo và Bảng điều khiển — đừng chép đôi, hai bản sẽ lệch.
 */
export function PaymentReconcile({
  paidTotal,
  revenue,
  label,
}: {
  /** Tổng tiền đã thu theo các phương thức, đơn vị xu. */
  paidTotal: number;
  /**
   * Doanh thu của ĐÚNG tập đơn đó, đơn vị xu. `undefined` = không đối chiếu.
   * ⚠️ Ở trang Báo cáo phải truyền `liveRevenue` chứ KHÔNG phải `totalRevenue`:
   * tổng kia có cả dữ liệu nhập từ POS cũ (không ghi hình thức trả) nên so là
   * so nhầm khoảng.
   */
  revenue?: number;
  /** Nhãn bên trái, VD "Doanh thu hôm nay" hoặc "Doanh thu từ 26/07". */
  label: string;
}) {
  const { lang } = useTranslation();

  if (typeof revenue !== "number") return null;

  // ⚠️ So BẰNG TUYỆT ĐỐI, không đặt sai số cho phép: tiền lưu theo xu (số nguyên)
  // nên lệch 1 đồng cũng là có chuyện thật.
  const gap = revenue - paidTotal;
  const matches = gap === 0;

  return (
    <>
      <li className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 leading-snug text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatCurrency(revenue)}
        </span>
        <span
          className={`w-10 shrink-0 text-right text-xs ${
            matches ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
          }`}
        >
          {matches ? "✓" : "≠"}
        </span>
      </li>

      {/* Lệch là chuyện thật, không phải chuyện trình bày — nói rõ nguyên nhân để
          chủ quán biết đi tìm ở đâu, chứ đừng chỉ ném ra con số chênh. */}
      {!matches && (
        <li className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 font-medium text-destructive">
              {lang === "vi" ? "Chênh" : "Gap"}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-destructive">
              {formatCurrency(Math.abs(gap))}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {gap > 0
              ? lang === "vi"
                ? "Có đơn đã đóng mà chưa ghi lần thu tiền nào — kiểm lại ở trang Đơn hàng."
                : "Some closed orders have no payment recorded — check the Orders page."
              : lang === "vi"
                ? "Tiền đã thu nhiều hơn doanh thu đơn — có đơn bị ghi thu hai lần, kiểm lại ở trang Đơn hàng."
                : "Payments exceed order revenue — an order was likely recorded as paid twice."}
          </p>
        </li>
      )}
    </>
  );
}
