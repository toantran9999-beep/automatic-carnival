"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  WsMessage,
  WsOrderPayload,
  WsPaymentConfirmedPayload,
  WsPrintTransferPayload,
} from "@restai/types";
import { useAuthStore } from "@/stores/auth-store";
import { useStationStore } from "@/stores/station-store";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  usePrintKitchenTicket,
  usePrintReceipt,
  usePrintTemporaryTransferBill,
} from "@/components/print-ticket";
import { useBranchSettings, useOrgSettings } from "@/hooks/use-settings";
import { apiFetch } from "@/lib/fetcher";
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
  const printTransferBill = usePrintTemporaryTransferBill();
  const { lang } = useTranslation();
  const printedRef = useRef<Set<string>>(new Set());
  /** Khóa riêng cho hóa đơn thanh toán — không dùng chung với printedRef của
   *  phiếu đặt món, kẻo cùng một đơn thì hóa đơn bị coi là đã in. */
  const printedReceiptRef = useRef<Set<string>>(new Set());
  /**
   * Phiếu KHÔNG in được — hiện khối đỏ phải bấm mới tắt.
   *
   * ⚠️ Cố ý không dùng toast: toast tự biến mất sau vài giây, mà máy quầy không
   * có ai ngồi canh màn hình. Sáng 03/09/2026 mất phiếu cả buổi không ai hay.
   */
  const [printAlarm, setPrintAlarm] = useState<
    { orderNumber: string; where: string; message: string } | null
  >(null);

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
          // Thiếu tùy chọn là hóa đơn in giá gốc mà tổng lại đã trừ tùy chọn.
          modifiers: (i as any).modifiers ?? [],
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

  /**
   * Máy bấm đơn xin in phiếu QR chuyển khoản → trạm quầy in, nhân viên bưng ra bàn.
   *
   * ⚠️ CỐ Ý KHÔNG chống in trùng ở đây, khác hẳn hai nhánh dưới. Nút "In lại phiếu"
   * trên máy bấm đơn phát lại đúng `paymentRequestId` cũ (in thêm một tờ giống hệt,
   * không sinh mã mới) — có bộ chống trùng là bấm In lại chẳng ra tờ nào.
   */
  const handlePrintTransfer = useCallback(
    (p: WsPrintTransferPayload) => {
      const station = useStationStore.getState();
      if (!station.isStation) return;
      if (!p?.orderNumber || !p.items?.length) return;

      const org = orgSettings as any;
      const branch = branchSettings as any;
      printTransferBill({
        businessName: org?.name || "TODA POS",
        address: branch?.address || undefined,
        orderNumber: p.orderNumber,
        tableNumber: p.tableNumber ?? undefined,
        customerName: p.customerName || undefined,
        createdAt: new Date().toISOString(),
        expiresAt: p.expiresAt || "",
        items: (p.items ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
          notes: i.notes ?? undefined,
          unit: i.unit ?? undefined,
          modifiers: i.modifiers ?? [],
        })),
        subtotal: p.subtotal,
        tax: p.tax,
        total: p.total,
        paymentCode: p.paymentCode,
        qrUrl: p.qrUrl ?? null,
        qrPayload: p.qrPayload ?? null,
        provider: p.provider === "momo" ? "momo" : "sepay",
        bank: p.bank ?? undefined,
      }).catch((e: any) => {
        // Phải kêu lên: khách đang đứng chờ tờ phiếu để quét, im lặng là kẹt luôn.
        toast.error(
          (lang === "vi" ? "Lỗi in phiếu QR: " : "QR bill print error: ") + (e?.message || ""),
        );
      });

      if (station.soundEnabled) beep();
      toast.info(
        lang === "vi"
          ? `Phiếu QR #${p.orderNumber} — đem ra cho khách`
          : `QR bill #${p.orderNumber} — hand it to the guest`,
      );
    },
    [branchSettings, orgSettings, printTransferBill, lang],
  );

  /**
   * Gửi kết quả in về máy chủ — kể cả khi HỎNG.
   *
   * Đây là mắt xích trước đây không có: không xác nhận thì không ai biết đơn nào
   * chưa ra giấy, và máy quầy cũng không tự đòi lại được.
   */
  const sendPrintAck = useCallback(
    async (
      orderId: string,
      body: {
        addOnId?: string;
        status: "ok" | "partial" | "failed";
        ticketsTotal: number;
        ticketsOk: number;
        error?: string;
      },
    ) => {
      try {
        await apiFetch(`/api/orders/${orderId}/print-ack`, {
          method: "POST",
          body: JSON.stringify({ kind: "kitchen", deviceLabel: navigator.userAgent.slice(0, 100), ...body }),
        });
      } catch {
        // Xác nhận không tới nơi thì vòng đòi phiếu sẽ thấy đơn này còn thiếu và
        // in lại. Thà thừa một tờ còn hơn thiếu một ly.
      }
    },
    [],
  );

  const printOrderTicket = useCallback(
    async (p: WsOrderPayload) => {
      // ⚠️ Khóa chống in trùng phải tính cả `reprintToken`: in lại dùng chung
      // `orderId` với phiếu gốc, không có khóa mới là lần in lại bị nuốt im lặng.
      const printKey = p?.reprintToken || p?.addOnId || p?.orderId;
      if (!p?.orderId || !printKey || printedRef.current.has(printKey)) return;
      // ⚠️ Đánh dấu TRƯỚC để hai gói tin trùng không in đôi, nhưng GỠ RA khi in
      // hỏng — bản cũ đánh dấu rồi bỏ đó, nên in hỏng vẫn bị coi là đã in và
      // vòng đòi phiếu sau đó cũng không cứu được.
      printedRef.current.add(printKey);

      const mode =
        (branchSettings as any)?.settings?.print_mode === "per_item" ? "per_item" : "combined";

      const where =
        p.tableNumber != null
          ? `${lang === "vi" ? "Bàn" : "Table"} ${p.tableNumber}`
          : lang === "vi"
            ? "Mang về"
            : "Takeaway";

      try {
        const res = await printKitchenTicket(
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
          mode,
        );

        const partial = res.ok < res.total;
        await sendPrintAck(p.orderId, {
          addOnId: p.addOnId,
          status: partial ? "partial" : "ok",
          ticketsTotal: res.total,
          ticketsOk: res.ok,
          error: partial ? `Chỉ ra ${res.ok}/${res.total} phiếu` : undefined,
        });

        if (partial) {
          printedRef.current.delete(printKey);
          setPrintAlarm({
            orderNumber: p.orderNumber,
            where,
            message: `Chỉ ra ${res.ok}/${res.total} phiếu — thiếu ${res.total - res.ok} tờ.`,
          });
          return;
        }

        if (useStationStore.getState().soundEnabled) beep();
        const kind = p.addOnId
          ? lang === "vi" ? "Thêm món" : "Added items"
          : lang === "vi" ? "Đơn mới" : "New order";
        toast.info(`${kind} #${p.orderNumber} · ${where}`);
      } catch (e: any) {
        printedRef.current.delete(printKey);
        await sendPrintAck(p.orderId, {
          addOnId: p.addOnId,
          status: "failed",
          ticketsTotal: 1,
          ticketsOk: 0,
          error: String(e?.message || e).slice(0, 400),
        });
        setPrintAlarm({ orderNumber: p.orderNumber, where, message: e?.message || "Không in được." });
      }
    },
    [branchSettings, printKitchenTicket, lang, sendPrintAck],
  );

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === "print:transfer") {
        handlePrintTransfer(msg.payload as WsPrintTransferPayload);
        return;
      }
      if (msg.type === "payment:confirmed") {
        handlePaymentConfirmed(msg.payload as WsPaymentConfirmedPayload);
        return;
      }
      if (msg.type !== "order:new") return;
      // Đọc state mới nhất phòng khi vừa tắt trạm.
      const station = useStationStore.getState();
      if (!station.isStation) return;

      const p = msg.payload as WsOrderPayload;
      // ⚠️ Máy chủ cho máy này vào phòng của MỌI chi nhánh trong token, nên phải
      // tự lọc — không có dòng này thì quầy chi nhánh chính in luôn phiếu của
      // Chi nhánh 2. Payload cũ chưa có `branchId` thì cứ in như trước.
      if (p?.branchId && selectedBranchId && p.branchId !== selectedBranchId) return;

      void printOrderTicket(p);
    },
    [printOrderTicket, selectedBranchId, handlePaymentConfirmed, handlePrintTransfer]
  );

  useWebSocket(
    selectedBranchId && isStation ? [`branch:${selectedBranchId}`] : [],
    handleWsMessage,
    accessToken || undefined
  );

  /**
   * Lưới an toàn: cứ 45 giây hỏi máy chủ "còn phiếu nào tôi chưa in không".
   *
   * ⚠️ Đây mới là thứ cứu được kiểu mất HẲN cả đơn. Lệnh in đi qua Redis pub/sub
   * — không lưu lịch sử, không hàng đợi, không thử lại — nên máy quầy rớt mạng
   * hay tắt tab lúc nào là mất trắng phiếu lúc đó, vĩnh viễn.
   *
   * Chống in trùng dựa vào SỔ Ở MÁY CHỦ chứ không phải tập trong RAM: F5 một cái
   * là tập kia trắng, còn sổ thì còn.
   */
  useEffect(() => {
    if (!isStation || !selectedBranchId || !accessToken) return;
    let stopped = false;

    const drain = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const list = await apiFetch<WsOrderPayload[]>("/api/orders/unprinted");
        if (stopped || !Array.isArray(list)) return;
        for (const p of list) {
          if (stopped) break;
          await printOrderTicket(p);
        }
      } catch {
        // Mất mạng thì lượt sau thử lại — không làm phiền quầy vì chuyện này.
      }
    };

    const timer = setInterval(drain, 45_000);
    const onVisible = () => { if (document.visibilityState === "visible") void drain(); };
    document.addEventListener("visibilitychange", onVisible);
    // Chạy ngay một lượt lúc mở trạm: máy vừa bật lên là đòi luôn phiếu bỏ lỡ.
    void drain();

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isStation, selectedBranchId, accessToken, printOrderTicket]);

  if (!printAlarm) return null;

  // Khối đỏ CHẶN NGANG màn hình, phải bấm mới tắt. Mất phiếu là mất ly nước —
  // không được phép trôi qua như một cái toast.
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4">
      <div
        role="alert"
        className="mx-auto flex max-w-2xl flex-col gap-3 rounded-xl border-2 border-destructive bg-destructive/10 p-4 shadow-2xl backdrop-blur"
      >
        <div>
          <p className="text-lg font-bold text-destructive">
            ⚠️ {lang === "vi" ? "KHÔNG IN ĐƯỢC PHIẾU" : "TICKET NOT PRINTED"} #{printAlarm.orderNumber}
          </p>
          <p className="mt-1 text-sm font-medium">{printAlarm.where}</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{printAlarm.message}</p>
          <p className="mt-2 text-sm leading-snug">
            {lang === "vi"
              ? "Kiểm dây USB, giấy và nguồn máy in, rồi bấm nút bên dưới — máy sẽ tự in lại phiếu còn thiếu."
              : "Check the USB cable, paper and printer power, then dismiss — missing tickets reprint automatically."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPrintAlarm(null)}
          className="h-12 w-full rounded-lg bg-destructive text-base font-bold text-destructive-foreground"
        >
          {lang === "vi" ? "Đã hiểu" : "Got it"}
        </button>
      </div>
    </div>
  );
}
