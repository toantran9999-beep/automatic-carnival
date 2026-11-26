"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsMessage } from "@restai/types";
import { toast } from "sonner";
import { Printer, Loader2, Banknote, CreditCard, Landmark, Clock3, Wallet } from "lucide-react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import {
  useCreatePayment,
  useCreatePaymentRequest,
  usePaymentRequest,
  useActivePaymentRequestByOrder,
  useBridgeStatus,
} from "@/hooks/use-payments";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { usePrintReceipt } from "@/components/print-ticket";
import { formatCurrency } from "@/lib/utils";
import { modifierLabel } from "@restai/config";
import { useTranslation } from "@/stores/lang-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuthStore } from "@/stores/auth-store";
import { perfStart, perfEnd } from "@/lib/perf";
import type { PosCartItem } from "../page";

interface PosPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  totalAmount: number; // in cents
  taxAmount: number; // in cents
  cart: PosCartItem[];
  customerName?: string;
  notes?: string;
  tableNumber?: string | null;
  onSuccess: () => void;
}

export function PosPaymentDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  totalAmount,
  taxAmount,
  cart,
  customerName,
  notes,
  tableNumber,
  onSuccess,
}: PosPaymentDialogProps) {
  const { t, lang } = useTranslation();
  const qc = useQueryClient();
  const { accessToken, selectedBranchId } = useAuthStore();
  const [method, setMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [processing, setProcessing] = useState(false);
  /**
   * Đã chốt tiền cho lần mở này chưa. Ref chứ không phải state: chốt xong là đóng
   * hộp thoại NGAY, không còn màn "đã thanh toán" nào để vẽ — chỉ cần chặn chốt
   * hai lần (vd. vừa bấm tay vừa có tin cầu nối báo tiền về).
   */
  const finishedRef = useRef(false);
  const [paymentRequestId, setPaymentRequestId] = useState<string | undefined>();
  /** Tiền đã vào tài khoản nhưng không khớp phiếu — xem handlePaymentWs. */
  const [mismatch, setMismatch] = useState<{ received: number; due: number } | null>(null);
  /** Đã tự nhận phiếu QR cũ cho lần mở này chưa — xem effect bên dưới. */
  const adoptedRef = useRef(false);

  const { data: orgSettings } = useOrgSettings();
  const { data: branchSettings } = useBranchSettings();
  const createPayment = useCreatePayment();
  const createPaymentRequest = useCreatePaymentRequest();
  const { data: paymentRequest } = usePaymentRequest(paymentRequestId);
  const printReceipt = usePrintReceipt();

  const currency = (branchSettings as any)?.currency || "VND";

  // Khóa bí mật đã bị máy chủ che (chỉ còn cờ *_set), nên chỉ kiểm phần công khai.
  const momoCfg = (branchSettings as any)?.settings?.payment?.momo;
  const momoEnabled = Boolean(
    momoCfg?.enabled && momoCfg?.partner_code && momoCfg?.access_key && momoCfg?.secret_key_set,
  );

  /** cash/card đi đường thu tay; transfer/momo đều là "in phiếu QR rồi chờ tiền về". */
  const isQrMethod = method === "transfer" || method === "momo";

  // Chỉ hỏi khi đang thực sự chờ tiền chuyển khoản về. Tiền mặt thì cầu nối
  // sống hay chết cũng không đổi việc gì.
  const { data: bridgeResp } = useBridgeStatus(open && isQrMethod);
  const bridge = (bridgeResp as any)?.data;
  /** Cầu nối đã bật nhưng đang mất tín hiệu → đơn sẽ KHÔNG tự chốt. */
  const bridgeDown = Boolean(bridge?.enabled && !bridge?.healthy);

  // Pre-fill amount tendered with exact total
  useEffect(() => {
    if (open) {
      setAmountTendered((totalAmount / 100).toString());
      finishedRef.current = false;
      setMethod("cash");
      setPaymentRequestId(undefined);
      setMismatch(null);
      adoptedRef.current = false;
    }
  }, [open, totalAmount]);

  // Mốc đo "bấm Thanh toán → hộp thoại hiện" (lib/perf.ts). Đo sau khung vẽ kế
  // tiếp chứ không phải lúc state đổi, để tính cả thời gian máy vẽ hộp thoại.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => perfEnd("mo-thanh-toan"));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  /**
   * Đơn này đã in phiếu QR chưa? Hỏi mỗi lần mở hộp thoại.
   *
   * `paymentRequestId` chỉ sống trong state, đóng hộp thoại là mất. Không có
   * truy vấn này thì mở lại đơn đã in phiếu QR sẽ thấy màn hình trắng trơn ở
   * mục Chuyển khoản, và thu ngân phải in thêm một phiếu nữa mới quay lại được
   * luồng đó — nên họ bấm Tiền mặt/Thẻ cho nhanh.
   */
  const { data: existingRequest } = useActivePaymentRequestByOrder(orderId, open);

  /**
   * Phiếu cũ chỉ dùng lại được khi số tiền CÒN KHỚP.
   *
   * ⚠️ Khách gọi thêm món sau lúc in phiếu là mã QR cũ mang số tiền cũ. Nếu cứ
   * dùng lại thì khách quét ra số nhỏ, chuyển đúng số nhỏ đó, mà nút xác nhận
   * lại ghi nhận đủ tổng mới — thất thu và sổ sách sai. Lệch tiền thì coi như
   * chưa có phiếu, thu ngân in phiếu mới (máy chủ tự huỷ phiếu cũ khi tạo).
   */
  const reusableQrRequest =
    (existingRequest as any)?.id && (existingRequest as any).amount === totalAmount
      ? (existingRequest as any)
      : null;

  /**
   * Tự nhảy vào đúng phương thức của phiếu đã in.
   *
   * `adoptedRef` để chỉ làm ĐÚNG MỘT LẦN mỗi lần mở: thu ngân chủ động đổi sang
   * Tiền mặt (khách đổi ý) thì không bị effect kéo ngược về Chuyển khoản.
   */
  useEffect(() => {
    if (!open || adoptedRef.current || !reusableQrRequest) return;
    adoptedRef.current = true;
    setPaymentRequestId(reusableQrRequest.id);
    setMethod(reusableQrRequest.provider === "momo" ? "momo" : "transfer");
  }, [open, reusableQrRequest]);

  // Cầu nối ngân hàng báo tiền về → máy chủ đã tự chốt đơn, chỉ việc đóng.
  useEffect(() => {
    const request = paymentRequest as any;
    if (!open || !request || request.status !== "paid" || finishedRef.current) return;
    finishWithoutPrint("Đã nhận tiền chuyển khoản");
  }, [paymentRequest, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nghe máy chủ báo tiền về để hiện NGAY, thay vì đợi tới 5 giây của vòng poll.
  // Vẫn GIỮ poll làm lưới an toàn: WS rớt thì poll cứu, mất tối đa 5 giây còn hơn treo.
  const handlePaymentWs = useCallback(
    (msg: WsMessage) => {
      if (
        msg.type !== "payment:confirmed" &&
        msg.type !== "payment:underpaid" &&
        msg.type !== "payment:mismatch"
      ) {
        return;
      }
      const p = msg.payload as {
        paymentRequestId?: string;
        receivedAmount?: number;
        currentDue?: number;
      };
      if (!paymentRequestId || p?.paymentRequestId !== paymentRequestId) return;

      /*
       * Tiền ĐÃ vào tài khoản nhưng không khớp phiếu — thường là bàn đổi món sau
       * khi in phiếu QR. Máy chủ không chốt, nhưng tiền thì đã nằm trong tài khoản
       * rồi, nên tuyệt đối không được im: thu ngân phải biết ngay để đối chiếu
       * chứ không phải ngồi chờ tới lúc khách hỏi.
       */
      if (msg.type === "payment:mismatch") {
        setMismatch({
          received: Number(p?.receivedAmount || 0),
          due: Number(p?.currentDue || 0),
        });
      }

      qc.invalidateQueries({ queryKey: ["payments", "requests", paymentRequestId] });
    },
    [paymentRequestId, qc],
  );

  useWebSocket(
    paymentRequestId && selectedBranchId ? [`branch:${selectedBranchId}`] : [],
    handlePaymentWs,
    accessToken || undefined,
  );

  /**
   * ⚠️ `unit_price` = giá GỐC chưa gồm tùy chọn, `total` = tiền cả dòng đã gồm —
   * đúng quy ước của print-ticket, để phiếu in được dòng phụ "- Nhẹ  -2.000đ" mà
   * cộng dọc vẫn ra đúng Tạm tính. Đừng cộng phụ trội vào `unit_price` hay ghép
   * tên tùy chọn vào tên món: sẽ tính phụ trội hai lần.
   */
  const mappedItems = cart.map((i) => {
    const modTotal = i.modifiers.reduce((sum, m) => sum + m.price, 0);
    return {
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total: (i.unitPrice + modTotal) * i.quantity,
      notes: i.notes,
      unit: i.unit,
      // Ghép con số vào tên ("Đường 13g") — đơn này in TỪ GIỎ, chưa qua máy chủ
      // nên chưa có bản chụp tên đã ghép sẵn.
      modifiers: i.modifiers.map((m) => ({
        name: modifierLabel(m.name, m.value, m.unit),
        price: m.price,
      })),
    };
  });

  /**
   * Chốt xong một lần thu tiền: ĐÓNG NGAY, báo bằng toast, rồi mới in.
   *
   * ⚠️ Trước đây hộp thoại đứng ở màn "Đã thanh toán" CỐ ĐỊNH 1,5 giây rồi mới
   * đóng — máy chủ ghi tiền chỉ mất ~40ms, nên gần như toàn bộ cảm giác "thanh
   * toán chậm" ở quầy là do chính cái chờ đó (anh Toàn báo 26/11/2026). Toast vẫn
   * nói ĐÚNG có in hay không: nói "đã in" mà không in là nhân viên đi tìm tờ hóa
   * đơn không tồn tại.
   *
   * In dời sang SAU khi đóng: dựng ảnh hóa đơn tiếng Việt bằng canvas chiếm luồng
   * giao diện cả trăm ms trên máy quầy yếu. Cho hộp thoại đóng và khung kế tiếp vẽ
   * xong trước, rồi mới dựng ảnh. Dữ liệu in chụp lại TRƯỚC khi đóng vì hộp thoại
   * có thể bị gỡ khỏi cây ngay sau đó.
   */
  const finish = (paidMethod: string, shouldPrint: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    // KHÔNG in phiếu đặt món ở đây: trạm quầy đã in ngay lúc đơn được tạo (nghe
    // sự kiện order:new). Chỉ in HÓA ĐƠN cho khách, và chỉ khi bấm nút "& In".
    const receipt = shouldPrint
      ? {
          businessName: (orgSettings as any)?.name || "Restaurante",
          ruc: (orgSettings as any)?.settings?.ruc || undefined,
          address: (branchSettings as any)?.address || undefined,
          orderNumber,
          createdAt: new Date().toISOString(),
          items: mappedItems,
          subtotal: totalAmount - taxAmount,
          tax: taxAmount,
          total: totalAmount,
          paymentMethod: paidMethod,
          customerName: customerName || undefined,
          docType: "boleta_simple" as const,
        }
      : null;

    toast.success(
      `Đã thu ${formatCurrency(totalAmount)} · #${orderNumber} · ${shouldPrint ? "đang in hóa đơn" : "không in"}`,
    );
    onOpenChange(false);
    onSuccess();

    requestAnimationFrame(() => {
      setTimeout(() => {
        perfEnd("thu-tien");
        if (receipt) printReceipt(receipt);
      }, 0);
    });
  };

  /** Máy chủ đã tự chốt (cầu nối ngân hàng) — chỉ đóng và báo, không in. */
  const finishWithoutPrint = (message: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    toast.success(`${message} · #${orderNumber}`);
    onOpenChange(false);
    onSuccess();
  };

  /**
   * Dựng yêu cầu thanh toán QR — rồi TRẠM QUẦY in phiếu, không phải máy này.
   *
   * ⚠️ Trước đây chính máy bấm đơn vừa dựng mã QR vừa gọi lệnh in. Trên điện thoại
   * nhân viên thì "lệnh in" là hộp thoại in của trình duyệt, nên thực tế mã QR chỉ
   * nằm trên màn hình điện thoại. Chủ quán chốt: mọi mã phải in ở quầy rồi bưng ra.
   * Nay máy chủ phát WS `print:transfer` và StationProvider ở quầy in — gọi lại hàm
   * này chính là nút "In lại phiếu" (dùng lại yêu cầu cũ, KHÔNG sinh mã mới).
   *
   * Dùng chung cho cả chuyển khoản ngân hàng lẫn MoMo — chỉ khác `provider`, còn
   * việc chờ tiền về và tự đóng đơn thì máy chủ lo giống hệt nhau.
   */
  const handleQrBill = async (provider: "sepay" | "momo") => {
    if (!orderId || processing) return;
    setProcessing(true);
    try {
      const request = await createPaymentRequest.mutateAsync({
        orderId,
        amount: totalAmount,
        provider,
      }) as any;
      setPaymentRequestId(request.id);
      toast.success("Đã gửi phiếu QR ra trạm quầy");
    } catch {
      // Lỗi đã có toast từ mutateAsync (VD: chưa cấu hình MoMo, MoMo không phản hồi).
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Ghi tiền rồi chốt. `paidMethod` = "transfer" khi thu ngân tự xác nhận khách đã
   * chuyển sau khi in phiếu QR.
   *
   * ⚠️ Không có nút xác nhận chuyển khoản thì luồng QR KHÔNG có đường đóng đơn:
   * thu ngân buộc phải quay ra bấm Tiền mặt/Thẻ. Dữ liệu thật 26-28/07: 32 phiếu QR
   * in ra thì 24 đơn bị ghi "Thẻ", 7 đơn "Tiền mặt" — doanh thu chuyển khoản trong
   * báo cáo bằng 0. Ghi `method: "transfer"` cho cả MoMo lẫn ngân hàng — enum
   * payment_method không có "momo", phân biệt bằng payment_requests.provider.
   */
  const recordPayment = async (paidMethod: string, shouldPrint: boolean) => {
    if (!orderId || processing || finishedRef.current) return;
    perfStart("thu-tien");
    setProcessing(true);
    try {
      await createPayment.mutateAsync({
        orderId,
        method: paidMethod,
        amount: totalAmount,
        tip: 0,
      });
      finish(paidMethod, shouldPrint);
    } catch {
      // Lỗi đã có toast từ mutateAsync.
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmQrPaid = (shouldPrint: boolean) => recordPayment("transfer", shouldPrint);

  const handlePaymentSubmit = async (shouldPrint: boolean) => {
    if (isQrMethod) {
      await handleQrBill(method === "momo" ? "momo" : "sepay");
      return;
    }
    await recordPayment(method, shouldPrint);
  };

  const tenderedCents = Math.round((parseFloat(amountTendered) || 0) * 100);
  const showChange = method === "cash" && tenderedCents > totalAmount;
  const changeAmount = showChange ? tenderedCents - totalAmount : 0;
  const transferRequest = paymentRequest as any;
  const expiresAt = transferRequest?.expires_at ? new Date(transferRequest.expires_at) : null;
  const isExpired = Boolean(expiresAt && Date.now() > expiresAt.getTime());
  /**
   * ⚠️ `cancelled` PHẢI có nhánh riêng. Trước đây nó rơi vào nhánh cuối và hiện
   * "Đang chờ chuyển khoản" — thu ngân ngồi chờ một tờ phiếu đã chết, khách quét
   * vào cũng không bao giờ chốt được.
   */
  const isCancelled = transferRequest?.status === "cancelled";
  const transferStatus = transferRequest?.status === "paid"
    ? "Đã nhận tiền"
    : transferRequest?.paid_amount > 0 && transferRequest.paid_amount < transferRequest.amount
      ? "Thiếu tiền"
      : isCancelled
        ? "Phiếu đã huỷ — món trên bàn đã đổi"
        : isExpired || transferRequest?.status === "expired"
          ? "Quá hạn"
          : transferRequest
            ? "Đang chờ chuyển khoản"
            : "";

  return (
    <Dialog open={open} onOpenChange={(val) => !processing && onOpenChange(val)}>
      {/* overflow-x-hidden: khoá hẳn chiều ngang. DialogContent có `overflow-y-auto`,
          mà theo luật CSS khoá một chiều là chiều kia tự thành cuộn được — nội dung
          lỡ rộng hơn khung thì nó âm thầm trượt ngang và cắt cụt, nhân viên không
          hề biết là mình đang thiếu chữ. */}
      <DialogContent className="max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            {lang === "vi" ? `Thanh toán Đơn hàng #${orderNumber}` : `Pay Order #${orderNumber}`}
          </DialogTitle>
        </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Totals panel */}
            {/* min-w-0 + shrink-0: nhãn co lại trước, SỐ TIỀN không bao giờ bị đẩy
                ra ngoài khung — mất số tiền là mất thứ quan trọng nhất của màn này. */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span className="min-w-0">{t("pos.subtotal")}</span>
                <span className="shrink-0 tabular-nums">{formatCurrency(totalAmount - taxAmount)}</span>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span className="min-w-0">{t("pos.tax")}</span>
                <span className="shrink-0 tabular-nums">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between gap-3 font-bold text-lg border-t pt-2 mt-1">
                <span className="min-w-0">{t("pos.total")}</span>
                <span className="shrink-0 tabular-nums text-primary">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label className="font-semibold">{t("payments.method")}</Label>
              {/* MoMo chỉ hiện khi chi nhánh đã bật + nhập khóa, kẻo thu ngân bấm
                  vào rồi nhận lỗi cấu hình ngay trước mặt khách. */}
              <div className={`grid gap-2 ${momoEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
                {[
                  { id: "cash", label: t("payments.cash"), icon: Banknote },
                  { id: "card", label: t("payments.card"), icon: CreditCard },
                  { id: "transfer", label: t("payments.transfer"), icon: Landmark },
                  ...(momoEnabled ? [{ id: "momo", label: "MoMo", icon: Wallet }] : []),
                ].map((item) => {
                  const Icon = item.icon;
                  const active = method === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id)}
                      className={`flex min-h-16 flex-col items-center justify-center p-3 rounded-xl border text-sm gap-1.5 transition-all font-medium ${
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5.5 w-5.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Cảnh báo, KHÔNG chặn: khách in phiếu QR rồi đổi ý trả tiền mặt là
                  chuyện có thật (dữ liệu 26-29/07 có 8 đơn kiểu đó). Chặn cứng chỉ
                  đẻ ra cách lách tệ hơn. Nếu số liệu vẫn sai thì mới siết. */}
              {!isQrMethod && reusableQrRequest && (
                <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  ⚠️ Đơn này đã in phiếu chuyển khoản QR. Chỉ chọn Tiền mặt/Thẻ nếu khách
                  đổi ý trả kiểu khác.
                </p>
              )}
            </div>

            {/* Tendered and change */}
            {method === "cash" && (
              <div className="space-y-2 pt-1.5 animate-in fade-in duration-200">
                <div className="flex justify-between items-center">
                  <Label htmlFor="tendered">{lang === "vi" ? "Khách đưa" : "Amount Tendered"}</Label>
                  {showChange && (
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">
                      {lang === "vi" ? "Tiền thối:" : "Change:"} {formatCurrency(changeAmount)}
                    </span>
                  )}
                </div>
                <Input
                  id="tendered"
                  type="number"
                  step={currency === "VND" ? "1000" : "0.01"}
                  placeholder="0"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  className="h-12 font-mono text-lg text-right pr-3"
                />
              </div>
            )}

            {isQrMethod && transferRequest && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary" />
                    {transferStatus}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleQrBill(method === "momo" ? "momo" : "sepay")}
                    disabled={processing}
                  >
                    {transferRequest.status === "expired" || isExpired || isCancelled
                      ? "In phiếu mới"
                      : "In lại phiếu"}
                  </Button>
                </div>
                {/* Cầu nối ngân hàng chết thì đơn KHÔNG tự chốt, mà nó chết rất
                    âm thầm — 04/08/2026 im 9 tiếng liền, hai lượt chuyển khoản
                    phải bấm tay mà không ai biết là hỏng. Dòng này để thu ngân
                    thấy ngay lúc đang chờ tiền, chứ không phải phát hiện ra vào
                    cuối ngày khi đối sổ. */}
                {/* Tiền đã về tài khoản nhưng không khớp phiếu. Đây là tin quan
                    trọng nhất có thể hiện ở màn này — tiền của khách đang nằm
                    trong tài khoản mà đơn chưa chốt. Để trên cả cảnh báo cầu nối. */}
                {mismatch && (
                  <div className="rounded-md border border-destructive bg-destructive/10 px-2 py-2 text-xs text-destructive">
                    <div className="font-bold">⚠️ Đã nhận {formatCurrency(mismatch.received)} nhưng chưa chốt được</div>
                    <div className="mt-0.5">
                      Bàn đang cần trả <b>{formatCurrency(mismatch.due)}</b> — món đã đổi sau khi in phiếu.
                    </div>
                    <div className="mt-1">
                      Kiểm lại món trên bàn, rồi bấm <b>In phiếu mới</b>. Nếu số tiền khách chuyển
                      đã đủ, thu phần còn thiếu hoặc bấm nút xanh bên dưới để chốt tay.
                    </div>
                  </div>
                )}
                {/* Số tiền THẬT trên tờ phiếu khách đang cầm, do máy chủ tính.
                    Màn hình này có thể đang hiện con số cũ trong bộ nhớ đệm —
                    chỉ hiện thêm dòng này khi hai số khác nhau, để thu ngân đọc
                    đúng cái khách phải trả chứ không đọc cái trên đầu màn hình. */}
                {!isCancelled && transferRequest.amount !== totalAmount && (
                  <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-700">
                    Phiếu đã in ghi <b>{formatCurrency(transferRequest.amount)}</b> — đây mới là số
                    khách phải chuyển.
                  </p>
                )}
                {isCancelled && !mismatch && (
                  <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    ⚠️ Món trên bàn đã đổi sau khi in phiếu, nên phiếu QR cũ không dùng được nữa.
                    Bấm <b>In phiếu mới</b> rồi đưa khách tờ mới.
                  </p>
                )}
                {bridgeDown && (
                  <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    ⚠️ Cầu nối ngân hàng mất tín hiệu
                    {typeof bridge?.minutesSince === "number" ? ` ${bridge.minutesSince} phút` : ""} — đơn
                    này sẽ <strong>KHÔNG tự chốt</strong>. Khách chuyển xong thì bấm nút xanh bên dưới.
                    {bridge?.listenerOk === false && " (Điện thoại đã tắt quyền đọc thông báo.)"}
                  </p>
                )}
                {/* ⚠️ KHÔNG vẽ mã QR ở đây, ở bất kỳ máy nào.
                    Trước đây máy bấm đơn tự dựng QR rồi hiện lên màn hình, nên
                    điện thoại nhân viên thành ra một cái QR chuyển khoản di động.
                    Chủ quán chốt: mọi mã phải do TRẠM QUẦY in ra giấy rồi bưng cho
                    khách. Máy chủ gửi thẳng lệnh in qua WS `print:transfer`; màn
                    hình này chỉ còn là chỗ theo dõi và xác nhận đã nhận tiền. */}
                <div className="rounded-lg border border-dashed bg-background/60 p-3 text-xs leading-snug">
                  <div className="font-semibold text-foreground">
                    Đã gửi phiếu QR ra trạm quầy — lấy phiếu đem cho khách
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {method === "momo"
                      ? "Trên phiếu ghi rõ khách quét bằng app MoMo."
                      : "Trên phiếu ghi rõ khách quét bằng app ngân hàng."}{" "}
                    Không thấy phiếu ra thì bấm “In lại phiếu”.
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  {method !== "momo" && (
                    <div>Mã: <span className="font-mono font-bold">{transferRequest.payment_code}</span></div>
                  )}
                  <div>
                    Hết hạn: {expiresAt ? expiresAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "-"}
                  </div>
                  <div>Số tiền: {formatCurrency(transferRequest.amount)}</div>
                  {transferRequest.paid_amount > 0 && transferRequest.paid_amount < transferRequest.amount && (
                    <div className="text-destructive">Đã nhận: {formatCurrency(transferRequest.paid_amount)}</div>
                  )}
                </div>
              </div>
            )}
          </div>

        {/* Hàng nút chốt — KHÔNG dùng DialogFooter dùng chung.
            DialogFooter đổi bố cục theo `sm:`, mà `sm:` đo theo MÀN HÌNH chứ không
            đo theo khung: máy POS màn rộng nên nó bật ngang 3 nút trong khung chỉ
            rộng 448px → đội ra ngoài, cắt cụt số tiền. Ở đây lưới 2 cột CỐ ĐỊNH, không
            phụ thuộc cỡ màn hình.

            "Không in" và "& In" là HAI NÚT TO NGANG NHAU (anh Toàn chốt 26/11/2026):
            trước đây "không in" là nút viền mỏng — ở luồng chuyển khoản còn là nút
            trơn không viền — nằm dưới nút in to, trong khi quán dùng nó rất nhiều
            (khách hay không lấy hóa đơn). Khác MÀU để không bấm nhầm. */}
        <div className="mt-2 flex flex-col gap-2">
          {isQrMethod && transferRequest ? (
            // ĐÃ in phiếu QR → việc chính là xác nhận khách đã chuyển. Trước đây không
            // có nút này nên thu ngân bấm Tiền mặt/Thẻ, doanh thu chuyển khoản = 0.
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleConfirmQrPaid(false)}
                disabled={processing}
                className="h-16 w-full whitespace-normal px-2 text-base font-bold leading-tight bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Đã chuyển – KHÔNG IN"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleConfirmQrPaid(true)}
                disabled={processing}
                className="h-16 w-full whitespace-normal px-2 text-base font-bold leading-tight border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400"
              >
                <Printer className="h-5 w-5 shrink-0" />
                Đã chuyển &amp; IN
              </Button>
            </div>
          ) : isQrMethod ? (
            // Chuyển khoản chưa in phiếu: chỉ MỘT nút — phiếu đó mang mã QR cho khách
            // quét, không in thì khách không có gì để quét.
            <Button
              onClick={() => handlePaymentSubmit(true)}
              disabled={processing}
              className="h-16 w-full text-base font-bold"
            >
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Printer className="h-5 w-5 mr-2" />
                  In phiếu tạm tính QR
                </>
              )}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handlePaymentSubmit(false)}
                disabled={processing}
                className="h-16 w-full whitespace-normal px-2 text-base font-bold leading-tight"
              >
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : lang === "vi" ? (
                  "Thu tiền – KHÔNG IN"
                ) : (
                  "Pay – no receipt"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePaymentSubmit(true)}
                disabled={processing}
                className="h-16 w-full whitespace-normal px-2 text-base font-bold leading-tight border-2 border-primary text-primary"
              >
                <Printer className="h-5 w-5 shrink-0" />
                {lang === "vi" ? "Thu tiền & IN" : "Pay & print"}
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
