"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Plus, RefreshCw } from "lucide-react";
import { usePayments, usePaymentSummary } from "@/hooks/use-payments";
import { PageHeader } from "@/components/page-header";
import { PaymentSummary } from "./_components/payment-summary";
import { PaymentsTable } from "./_components/payments-table";
import { PaymentDialog } from "./_components/payment-dialog";
import { ReceiptDialog } from "./_components/receipt-dialog";
import { InvoiceDialog } from "./_components/invoice-dialog";
import { useTranslation } from "@/stores/lang-store";

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<any>(null);

  const { data, isLoading, error, refetch } = usePayments();
  const { data: summary } = usePaymentSummary();

  const payments: any[] = data ?? [];

  const openInvoiceForPayment = (payment: any) => {
    setSelectedPayment(payment);
    setInvoiceDialogOpen(true);
  };

  const openReceiptDialog = (payment: any) => {
    setReceiptPayment(payment);
    setReceiptDialogOpen(true);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("payments.title")}</h1>
        </div>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">{t("common.error")}: {(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payments.title")}
        description={isLoading ? t("common.loading") : `${payments.length} ${t("payments.registeredPayments")}`}
        actions={
          <Button onClick={() => setPaymentDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("payments.registerPayment")}
          </Button>
        }
      />

      <PaymentSummary summary={summary} />

      <PaymentsTable
        payments={payments}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        methodFilter={methodFilter}
        onMethodFilterChange={setMethodFilter}
        onInvoice={openInvoiceForPayment}
        onReceipt={openReceiptDialog}
      />

      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
      />

      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        payment={receiptPayment}
      />

      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        payment={selectedPayment}
      />
    </div>
  );
}
