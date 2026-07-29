"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsMessage } from "@restai/types";
import { Printer, CheckCircle2, Loader2, Banknote, CreditCard, Landmark, Clock3, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
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
} from "@/hooks/use-payments";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { usePrintReceipt, usePrintTemporaryTransferBill } from "@/components/print-ticket";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuthStore } from "@/stores/auth-store";
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
  const [docType, setDocType] = useState<"boleta_simple" | "boleta_electronica" | "factura">("boleta_simple");
  const [docNumber, setDocNumber] = useState("");
  const [docHolderName, setDocHolderName] = useState("");
  const [method, setMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  /** Lần thanh toán này có in hóa đơn không — để màn báo thành công nói đúng sự thật. */
  const [printedReceipt, setPrintedReceipt] = useState(true);
  const [paymentRequestId, setPaymentRequestId] = useState<string | undefined>();
  /** Đã tự nhận phiếu QR cũ cho lần mở này chưa — xem effect bên dưới. */
  const adoptedRef = useRef(false);

  const { data: orgSettings } = useOrgSettings();
  const { data: branchSettings } = useBranchSettings();
  const createPayment = useCreatePayment();
  const createPaymentRequest = useCreatePaymentRequest();
  const { data: paymentRequest } = usePaymentRequest(paymentRequestId);
  const printReceipt = usePrintReceipt();
  const printTemporaryTransferBill = usePrintTemporaryTransferBill();

  const currency = (branchSettings as any)?.currency || "VND";

  // Khóa bí mật đã bị máy chủ che (chỉ còn cờ *_set), nên chỉ kiểm phần công khai.
  const momoCfg = (branchSettings as any)?.settings?.payment?.momo;
  const momoEnabled = Boolean(
    momoCfg?.enabled && momoCfg?.partner_code && momoCfg?.access_key && momoCfg?.secret_key_set,
  );

  /** cash/card đi đường thu tay; transfer/momo đều là "in phiếu QR rồi chờ tiền về". */
  const isQrMethod = method === "transfer" || method === "momo";

  // Pre-fill amount tendered with exact total
  useEffect(() => {
    if (open) {
      setAmountTendered((totalAmount / 100).toString());
      setPaymentSuccess(false);
      setPrintedReceipt(true);
      setMethod("cash");
      setDocType("boleta_simple");
      setDocNumber("");
      setDocHolderName("");
      setPaymentRequestId(undefined);
      adoptedRef.current = false;
    }
  }, [open, totalAmount]);

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

  useEffect(() => {
    const request = paymentRequest as any;
    if (!request || request.status !== "paid" || paymentSuccess) return;
    setPaymentSuccess(true);
    setTimeout(() => {
      onSuccess();
      onOpenChange(false);
    }, 1500);
  }, [paymentRequest, paymentSuccess, onSuccess, onOpenChange]);

  // Nghe máy chủ báo tiền về để hiện NGAY, thay vì đợi tới 5 giây của vòng poll.
  // Vẫn GIỮ poll làm lưới an toàn: WS rớt thì poll cứu, mất tối đa 5 giây còn hơn treo.
  const handlePaymentWs = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== "payment:confirmed" && msg.type !== "payment:underpaid") return;
      const p = msg.payload as { paymentRequestId?: string };
      if (!paymentRequestId || p?.paymentRequestId !== paymentRequestId) return;
      qc.invalidateQueries({ queryKey: ["payments", "requests", paymentRequestId] });
    },
    [paymentRequestId, qc],
  );

  useWebSocket(
    paymentRequestId && selectedBranchId ? [`branch:${selectedBranchId}`] : [],
    handlePaymentWs,
    accessToken || undefined,
  );

  const isFormValid = () => {
    if (docType === "boleta_simple") return true;
    if (docType === "boleta_electronica") return /^\d{8}$/.test(docNumber);
    if (docType === "factura") return /^\d{11}$/.test(docNumber) && docHolderName.trim().length > 0;
    return false;
  };

  const handleDocTypeChange = (v: string) => {
    setDocType(v as "boleta_simple" | "boleta_electronica" | "factura");
    setDocNumber("");
    setDocHolderName("");
  };

  const mappedItems = cart.map((i) => {
    const modTotal = i.modifiers.reduce((sum, m) => sum + m.price, 0);
    const nameWithMods = i.modifiers.length > 0
      ? `${i.name} (${i.modifiers.map((m) => m.name).join(", ")})`
      : i.name;
    return {
      name: nameWithMods,
      quantity: i.quantity,
      unit_price: i.unitPrice + modTotal,
      total: (i.unitPrice + modTotal) * i.quantity,
      notes: i.notes,
      unit: i.unit,
    };
  });

  /**
   * Dựng yêu cầu thanh toán QR rồi in phiếu tạm tính cho khách quét.
   *
   * Dùng chung cho cả chuyển khoản ngân hàng lẫn MoMo — chỉ khác `provider`, còn
   * việc chờ tiền về và tự đóng đơn thì máy chủ lo giống hệt nhau.
   */
  const handleQrBill = async (provider: "sepay" | "momo") => {
    if (!orderId || !isFormValid() || processing) return;
    setProcessing(true);
    try {
      const request = await createPaymentRequest.mutateAsync({
        orderId,
        amount: totalAmount,
        provider,
      }) as any;
      setPaymentRequestId(request.id);

      const org = orgSettings as any;
      const branch = branchSettings as any;
      printTemporaryTransferBill({
        businessName: org?.name || "TODA POS",
        address: branch?.address || undefined,
        orderNumber,
        tableNumber,
        customerName,
        createdAt: new Date().toISOString(),
        expiresAt: request.expires_at,
        items: mappedItems,
        subtotal: totalAmount - taxAmount,
        tax: taxAmount,
        total: totalAmount,
        paymentCode: request.payment_code,
        qrUrl: request.qr_url,
        // KHÔNG rơi về payment_code: QR chứa "TODA-..." thì app quét ra chuỗi vô
        // nghĩa và báo mã không hợp lệ. Thiếu payload thì thà đừng in QR.
        qrPayload: request.qr_payload,
        provider,
        bank: request.bank,
      });
    } catch {
      // Lỗi đã có toast từ mutateAsync (VD: chưa cấu hình MoMo, MoMo không phản hồi).
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Thu ngân tự xác nhận "khách đã chuyển tiền rồi" sau khi đã in phiếu QR.
   *
   * ⚠️ Không có nút này thì luồng chuyển khoản KHÔNG có đường đóng đơn: màn hình
   * chỉ có mỗi nút in phiếu, nên thu ngân buộc phải quay ra bấm Tiền mặt/Thẻ để
   * kết thúc. Hậu quả đo được trên dữ liệu thật (26-28/07): 32 phiếu QR in ra thì
   * 24 đơn bị ghi thành "Thẻ", 7 đơn thành "Tiền mặt" — doanh thu chuyển khoản
   * trong báo cáo bằng 0 dù ngày nào cũng có khách chuyển.
   *
   * Ghi `method: "transfer"` cho cả MoMo lẫn chuyển khoản ngân hàng — enum
   * payment_method không có "momo", phân biệt bằng payment_requests.provider.
   */
  const handleConfirmQrPaid = async (shouldPrint: boolean) => {
    if (!orderId || !isFormValid() || processing) return;
    setProcessing(true);
    setPrintedReceipt(shouldPrint);
    try {
      await createPayment.mutateAsync({
        orderId,
        method: "transfer",
        amount: totalAmount,
        tip: 0,
      });
      setPaymentSuccess(true);

      if (shouldPrint) {
        const org = orgSettings as any;
        const branch = branchSettings as any;
        printReceipt({
          businessName: org?.name || "Restaurante",
          ruc: org?.settings?.ruc || undefined,
          address: branch?.address || undefined,
          orderNumber,
          createdAt: new Date().toISOString(),
          items: mappedItems,
          subtotal: totalAmount - taxAmount,
          tax: taxAmount,
          total: totalAmount,
          paymentMethod: "transfer",
          customerName: customerName || undefined,
          docType,
          docNumber: docType !== "boleta_simple" ? docNumber : undefined,
          docHolderName: docType === "factura" ? docHolderName : undefined,
        });
      }

      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1500);
    } catch {
      // Lỗi đã có toast từ mutateAsync.
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentSubmit = async (shouldPrint: boolean) => {
    if (!orderId || !isFormValid() || processing) return;
    if (isQrMethod) {
      await handleQrBill(method === "momo" ? "momo" : "sepay");
      return;
    }
    setProcessing(true);
    setPrintedReceipt(shouldPrint);

    try {
      // 1. Process payment via API
      await createPayment.mutateAsync({
        orderId,
        method,
        amount: totalAmount,
        tip: 0,
      });

      setPaymentSuccess(true);

      // KHÔNG in phiếu đặt món ở đây: trạm quầy đã in ngay lúc đơn được tạo (nghe
      // sự kiện order:new). In lại là thừa một tờ, và tờ đó mang tên máy đang bấm
      // chứ không phải người ở quầy.

      // In hóa đơn cho khách — chỉ khi bấm nút "Xác nhận & In hóa đơn"
      if (shouldPrint) {
        const org = orgSettings as any;
        const branch = branchSettings as any;
        printReceipt({
          businessName: org?.name || "Restaurante",
          ruc: org?.settings?.ruc || undefined,
          address: branch?.address || undefined,
          orderNumber,
          createdAt: new Date().toISOString(),
          items: mappedItems,
          subtotal: totalAmount - taxAmount,
          tax: taxAmount,
          total: totalAmount,
          paymentMethod: method,
          customerName: customerName || undefined,
          docType,
          docNumber: docType !== "boleta_simple" ? docNumber : undefined,
          docHolderName: docType === "factura" ? docHolderName : undefined,
        });
      }

      // 5. Trigger success callback to clear cart & close
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      // Error is handled by mutateAsync toast
    } finally {
      setProcessing(false);
    }
  };

  const tenderedCents = Math.round((parseFloat(amountTendered) || 0) * 100);
  const showChange = method === "cash" && tenderedCents > totalAmount;
  const changeAmount = showChange ? tenderedCents - totalAmount : 0;
  const transferRequest = paymentRequest as any;
  const expiresAt = transferRequest?.expires_at ? new Date(transferRequest.expires_at) : null;
  const isExpired = Boolean(expiresAt && Date.now() > expiresAt.getTime());
  const transferStatus = transferRequest?.status === "paid"
    ? "Đã nhận tiền"
    : transferRequest?.paid_amount > 0 && transferRequest.paid_amount < transferRequest.amount
      ? "Thiếu tiền"
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

        {paymentSuccess ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-16 w-16 bg-green-100 dark:bg-green-950/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            {/* Báo đúng thứ vừa xảy ra — nói "đã in" mà không in là nhân viên đi tìm
                tờ hóa đơn không tồn tại. */}
            <h3 className="text-lg font-bold text-foreground">
              {printedReceipt
                ? lang === "vi" ? "Đã thanh toán & in hóa đơn" : "Paid & receipt printed"
                : lang === "vi" ? "Đã thanh toán" : "Payment recorded"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {printedReceipt
                ? lang === "vi"
                  ? "Hóa đơn đã được gửi tới máy in."
                  : "Receipt sent to the printer."
                : lang === "vi"
                  ? "Đã ghi nhận tiền, không in hóa đơn."
                  : "Payment recorded, no receipt printed."}
            </p>
          </div>
        ) : (
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

            {/* Document type */}
            <div className="space-y-1.5">
              <Label className="font-semibold">{lang === "vi" ? "Loại chứng từ" : "Invoice Type"}</Label>
              <Select value={docType} onValueChange={handleDocTypeChange}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boleta_simple">{t("payments.receipt")}</SelectItem>
                  <SelectItem value="boleta_electronica">
                    {lang === "vi" ? "Hóa đơn bán lẻ (DNI/CCCD)" : "Retail Receipt (DNI)"}
                  </SelectItem>
                  <SelectItem value="factura">
                    {lang === "vi" ? "Hóa đơn VAT (MST công ty)" : "VAT Invoice (RUC)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Document Conditional Inputs */}
            {docType === "boleta_electronica" && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <Label htmlFor="posDni">{lang === "vi" ? "Số DNI/CCCD" : "ID Number (DNI)"}</Label>
                <Input
                  id="posDni"
                  placeholder="12345678"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
                {docNumber.length > 0 && docNumber.length !== 8 && (
                  <p className="text-xs text-destructive">
                    {lang === "vi" ? "Mã DNI phải gồm 8 chữ số" : "DNI must be 8 digits"}
                  </p>
                )}
              </div>
            )}

            {docType === "factura" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <Label htmlFor="posRuc">{lang === "vi" ? "Mã số thuế (RUC)" : "Tax Registry (RUC)"}</Label>
                  <Input
                    id="posRuc"
                    placeholder="20123456789"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  />
                  {docNumber.length > 0 && docNumber.length !== 11 && (
                    <p className="text-xs text-destructive">
                      {lang === "vi" ? "Mã số thuế RUC phải gồm 11 chữ số" : "RUC must be 11 digits"}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="posRazon">{lang === "vi" ? "Tên đơn vị/công ty" : "Company Name"}</Label>
                  <Input
                    id="posRazon"
                    placeholder={lang === "vi" ? "Tên đầy đủ của công ty..." : "Full company name..."}
                    value={docHolderName}
                    onChange={(e) => setDocHolderName(e.target.value)}
                  />
                </div>
              </div>
            )}

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
                    {transferRequest.status === "expired" || isExpired ? "In phiếu mới" : "In lại phiếu"}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  {/* Chỉ hiện QR khi có chuỗi VietQR thật — trước đây rơi về payment_code
                      nên khách quét ra "Mã thanh toán không hợp lệ". */}
                  {transferRequest.qr_payload ? (
                    <div className="rounded-lg bg-white p-2">
                      <QRCodeSVG value={transferRequest.qr_payload} size={96} level="M" />
                    </div>
                  ) : (
                    <div className="w-[112px] shrink-0 rounded-lg border border-dashed p-2 text-center text-[11px] text-muted-foreground">
                      Chưa cấu hình tài khoản ngân hàng
                    </div>
                  )}
                  <div className="min-w-0 text-xs space-y-1">
                    {/* Nói rõ mở app nào — QR MoMo và QR ngân hàng khác nhau, quét
                        nhầm app là máy báo lỗi rồi nhân viên phải giải thích. */}
                    <div className="font-semibold text-foreground">
                      {method === "momo" ? "Khách quét bằng app MoMo" : "Khách quét bằng app ngân hàng"}
                    </div>
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
              </div>
            )}
          </div>
        )}

        {/* Hàng nút LUÔN xếp dọc — KHÔNG dùng DialogFooter dùng chung.
            DialogFooter xếp ngang theo `sm:`, mà `sm:` đo theo MÀN HÌNH chứ không
            đo theo khung: máy POS màn rộng nên nó bật ngang, trong khi khung chỉ
            rộng 448px → 3 nút đội ra ngoài, kéo cả khung trượt ngang và cắt cụt
            số tiền bên phải. Xếp dọc vừa hết lỗi vừa dễ bấm trên máy quầy. */}
        {!paymentSuccess && (
          <div className="mt-2 flex flex-col gap-2">
            {/* ĐÃ in phiếu QR rồi thì việc chính không còn là in nữa, mà là xác nhận
                khách đã chuyển tiền. Đưa nút này lên TRÊN CÙNG để thu ngân bấm đúng
                chỗ — trước đây không có nút này nên họ phải bấm Tiền mặt/Thẻ, làm
                doanh thu chuyển khoản trong báo cáo bằng 0. */}
            {isQrMethod && transferRequest && (
              <Button
                onClick={() => handleConfirmQrPaid(true)}
                disabled={processing}
                className="h-12 w-full font-semibold text-base bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Khách đã chuyển — Thu tiền &amp; In hóa đơn
              </Button>
            )}

            {/* In phiếu QR chỉ còn là việc chính khi CHƯA in lần nào. In rồi thì nút
                in lại nằm ngay cạnh mã QR phía trên, khỏi lặp ở đây. */}
            {!(isQrMethod && transferRequest) && (
              <Button
                onClick={() => handlePaymentSubmit(true)}
                disabled={processing || !isFormValid()}
                className="h-12 w-full font-semibold text-base"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {lang === "vi" ? "Đang xử lý..." : "Processing..."}
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    {isQrMethod
                      ? "In phiếu tạm tính QR"
                      : (lang === "vi" ? "Xác nhận & In hóa đơn" : "Confirm & Print Receipt")}
                  </>
                )}
              </Button>
            )}

            {/* Không in hóa đơn — quán nhiều khách không lấy, đỡ tốn giấy. */}
            {isQrMethod && transferRequest && (
              <Button
                variant="ghost"
                onClick={() => handleConfirmQrPaid(false)}
                disabled={processing}
                className="h-11 w-full font-semibold"
              >
                Khách đã chuyển — Thu tiền, không in
              </Button>
            )}

            {/* Chuyển khoản chỉ có MỘT nút: phiếu đó mang mã QR cho khách quét,
                không in thì khách không có gì để quét. */}
            {!isQrMethod && (
              <Button
                variant="outline"
                onClick={() => handlePaymentSubmit(false)}
                disabled={processing || !isFormValid()}
                className="h-11 w-full font-semibold"
              >
                {lang === "vi" ? "Xác nhận, không in" : "Confirm, no receipt"}
              </Button>
            )}

            <Button
              variant="ghost"
              className="h-10 w-full"
              onClick={() => onOpenChange(false)}
              disabled={processing}
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
