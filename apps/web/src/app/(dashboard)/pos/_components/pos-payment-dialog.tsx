"use client";

import { useState, useEffect } from "react";
import { Printer, CheckCircle2, Loader2, Banknote, CreditCard, Landmark } from "lucide-react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreatePayment } from "@/hooks/use-payments";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { usePrintReceipt, usePrintKitchenTicket } from "@/components/print-ticket";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
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
  const [docType, setDocType] = useState<"boleta_simple" | "boleta_electronica" | "factura">("boleta_simple");
  const [docNumber, setDocNumber] = useState("");
  const [docHolderName, setDocHolderName] = useState("");
  const [method, setMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const { data: orgSettings } = useOrgSettings();
  const { data: branchSettings } = useBranchSettings();
  const createPayment = useCreatePayment();
  const printReceipt = usePrintReceipt();
  const printKitchenTicket = usePrintKitchenTicket();

  const currency = (branchSettings as any)?.currency || "VND";

  // Pre-fill amount tendered with exact total
  useEffect(() => {
    if (open) {
      setAmountTendered((totalAmount / 100).toString());
      setPaymentSuccess(false);
      setMethod("cash");
      setDocType("boleta_simple");
      setDocNumber("");
      setDocHolderName("");
    }
  }, [open, totalAmount]);

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

  const handlePaymentSubmit = async () => {
    if (!orderId || !isFormValid() || processing) return;
    setProcessing(true);

    try {
      // 1. Process payment via API
      await createPayment.mutateAsync({
        orderId,
        method,
        amount: totalAmount,
        tip: 0,
      });

      setPaymentSuccess(true);

      // 2. Map items for thermal printing
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
        };
      });

      // 3. Print Kitchen Preparation Ticket
      const printMode = (branchSettings as any)?.settings?.print_mode === "per_item" ? "per_item" : "combined";
      void printKitchenTicket({
        orderNumber,
        tableNumber: tableNumber || undefined,
        customerName: customerName || undefined,
        createdAt: new Date().toISOString(),
        items: mappedItems,
        notes: notes || undefined,
      }, printMode);

      // 4. Print Customer Receipt/Invoice
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

  return (
    <Dialog open={open} onOpenChange={(val) => !processing && onOpenChange(val)}>
      <DialogContent className="max-w-md">
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
            <h3 className="text-lg font-bold text-foreground">
              {lang === "vi" ? "Thanh toán & In thành công" : "Payment & Print Success"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {lang === "vi"
                ? "Hóa đơn và phiếu chế biến đã được gửi tới máy in thermal."
                : "Receipt and preparation tickets sent to thermal printer."}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-sm">
            {/* Totals panel */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.subtotal")}</span>
                <span>{formatCurrency(totalAmount - taxAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.tax")}</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2 mt-1">
                <span>{t("pos.total")}</span>
                <span className="text-primary">{formatCurrency(totalAmount)}</span>
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
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "cash", label: t("payments.cash"), icon: Banknote },
                  { id: "card", label: t("payments.card"), icon: CreditCard },
                  { id: "transfer", label: t("payments.transfer"), icon: Landmark },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = method === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs gap-1.5 transition-all font-medium ${
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
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
                  className="font-mono text-base text-right pr-3"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          {!paymentSuccess && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handlePaymentSubmit}
                disabled={processing || !isFormValid()}
                className="font-semibold px-5"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {lang === "vi" ? "Đang xử lý..." : "Processing..."}
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    {lang === "vi" ? "Xác nhận & In Hóa đơn" : "Confirm & Print Receipt"}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
