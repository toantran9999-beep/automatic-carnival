"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { WsMessage, WsOrderPayload, WsPaymentConfirmedPayload } from "@restai/types";
import { useAuthStore } from "@/stores/auth-store";
import { useStationStore } from "@/stores/station-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { usePrintKitchenTicket, usePrintReceipt } from "@/components/print-ticket";
import { useBranchSettings, useOrgSettings } from "@/hooks/use-settings";
import { useTranslation } from "@/stores/lang-store";
import { beep } from "@/lib/beep";

/**
 * Chạy nền trong layout dashboard. Chỉ thiết bị được đặt làm "Trạm quầy"
 * (useStationStore.isStation) mới mở kết nối WS và tự in phiếu bếp khi có
 * `order:new`. Các máy khác (điện thoại order) KHÔNG in.
 */
export function StationProvider() {
  const { accessToken, selectedBranchId } = useAuthStore();
  const isStation = useStationStore((s) => s.isStation);
  const { data: branchSettings } = useBranchSettings();
  const { data: orgSettings } = useOrgSettings();
  const printKitchenTicket = usePrintKitchenTicket();
  const printReceipt = usePrintReceipt();
  const { lang } = useTranslation();
  const printedRef = useRef<Set<string>>(new Set());
  /** Khóa riêng cho hóa đơn thanh toán — không dùng chung với printedRef của
   *  phiếu đặt món, kẻo cùng một đơn thì hóa đơn bị coi là đã in. */
  const printedReceiptRef = useRef<Set<string>>(new Set());

  // Chẩn đoán: báo cầu in USB (window.TodaPrintBridge) có được app nạp không.
  useEffect(() => {
    if (!isStation) return;
    const b = (window as any).TodaPrintBridge || (window as any).AndroidPrintBridge;
    toast(
      b && typeof b.printBase64 === "function"
        ? "✅ Cầu in USB sẵn sàng — in ngầm, không hộp thoại"
        : "⚠️ KHÔNG thấy cầu in USB → sẽ hiện hộp thoại. (Đang mở bằng app TODA POS Quầy chưa?)",
      { duration: 6000 }
    );
  }, [isStation]);

  /**
   * Tiền vừa về qua cổng thanh toán (MoMo / SePay) → tự in hóa đơn cho khách.
   *
   * Đường thanh toán tự động trước đây KHÔNG in gì cả: chỉ khi thu ngân bấm
   * "Xác nhận & In hóa đơn" mới có phiếu. Khách tự quét QR rồi đi về thì không ai
   * in, mà cũng chẳng ai biết là đã trả tiền.
   */
  const handlePaymentConfirmed = useCallback(
    (p: WsPaymentConfirmedPayload) => {
      const station = useStationStore.getState();
      if (!station.isStation) return;

      // KHÔNG kêu ở đây: NotificationBell nằm cùng layout và đã kêu cho mọi máy
      // rồi. Kêu thêm ở trạm là máy quầy "ting" hai lần chồng lên nhau.

      const branch = branchSettings as any;
      // Mặc định BẬT: chưa có khóa trong settings nghĩa là quán chưa từng đụng tới.
      const autoPrint = branch?.settings?.auto_print_receipt_on_paid !== false;
      if (!autoPrint) return;

      // Thiếu chi tiết món thì không dựng nổi hóa đơn — thà không in còn hơn in tờ trống.
      if (!p.orderNumber || !p.items?.length) return;

      const key = p.paymentRequestId || p.orderId;
      if (!key || printedReceiptRef.current.has(key)) return;
      printedReceiptRef.current.add(key);

      const org = orgSettings as any;
      printReceipt({
        businessName: org?.name || "TODA POS",
        ruc: org?.settings?.ruc || undefined,
        address: branch?.address || undefined,
        orderNumber: p.orderNumber,
        createdAt: new Date().toISOString(),
        items: (p.items ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
          notes: i.notes ?? undefined,
          unit: i.unit ?? undefined,
        })),
        subtotal: (p.subtotal ?? 0),
        tax: p.tax ?? 0,
        total: p.total ?? p.amount,
        paymentMethod: "transfer",
        customerName: p.customerName || undefined,
        docType: "boleta_simple",
      }).catch((e: any) => {
        // In hỏng thì phải kêu lên: tiền đã vào rồi, im lặng là khách đứng chờ hóa đơn.
        toast.error(
          (lang === "vi" ? "Lỗi in hóa đơn: " : "Receipt print error: ") + (e?.message || "")
        );
      });
    },
    [branchSettings, orgSettings, printReceipt, lang]
  );

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === "payment:confirmed") {
        handlePaymentConfirmed(msg.payload as WsPaymentConfirmedPayload);
        return;
      }
      if (msg.type !== "order:new") return;
      // Đọc state mới nhất phòng khi vừa tắt trạm.
      const station = useStationStore.getState();
      if (!station.isStation) return;

      const p = msg.payload as WsOrderPayload;
      // Lô món thêm có khóa riêng: nếu chống trùng theo orderId thì đơn đã in rồi
      // sẽ bị bỏ qua, món khách gọi thêm âm thầm không tới quầy.
      const printKey = p?.addOnId || p?.orderId;
      if (!p?.orderId || !printKey || printedRef.current.has(printKey)) return;
      printedRef.current.add(printKey);

      const mode =
        (branchSettings as any)?.settings?.print_mode === "per_item"
          ? "per_item"
          : "combined";

      printKitchenTicket(
        {
          orderNumber: p.orderNumber,
          tableNumber: p.tableNumber ?? undefined,
          tableZone: p.tableZone ?? undefined,
          customerName: p.customerName ?? undefined,
          // Tên người bấm đơn do máy chủ gửi kèm. Máy này là máy dùng chung nên
          // KHÔNG được lấy tài khoản đang đăng nhập ở đây làm tên trên phiếu.
          staffName: p.staffName ?? undefined,
          isAddOn: !!p.addOnId,
          createdAt: p.createdAt || new Date().toISOString(),
          items: (p.items ?? []).map((i) => ({
            name: i.name,
            modifiers: (i as any).modifiers ?? undefined,
            quantity: i.quantity,
            unit_price: 0,
            total: 0,
            notes: i.notes,
            unit: i.unit ?? undefined,
          })),
        },
        mode
      ).catch((e: any) => {
        toast.error(
          (lang === "vi" ? "Lỗi in phiếu: " : "Print error: ") + (e?.message || "")
        );
      });

      if (station.soundEnabled) beep();

      const where =
        p.tableNumber != null
          ? `${lang === "vi" ? "Bàn" : "Table"} ${p.tableNumber}`
          : lang === "vi"
            ? "Mang về"
            : "Takeaway";
      const kind = p.addOnId
        ? lang === "vi" ? "Thêm món" : "Added items"
        : lang === "vi" ? "Đơn mới" : "New order";
      toast.info(`${kind} #${p.orderNumber} · ${where}`);
    },
    [branchSettings, printKitchenTicket, lang]
  );

  useWebSocket(
    selectedBranchId && isStation ? [`branch:${selectedBranchId}`] : [],
    handleWsMessage,
    accessToken || undefined
  );

  return null;
}
