"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { ChevronLeft, ChevronRight, DollarSign, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { variant: "outline" },
  confirmed: { variant: "secondary" },
  preparing: { variant: "default" },
  ready: { variant: "default" },
  served: { variant: "secondary" },
  completed: { variant: "secondary" },
  cancelled: { variant: "destructive" },
};

const paymentStatusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  paid: { variant: "default", className: "bg-green-600 hover:bg-green-600" },
  partial: { variant: "default", className: "bg-amber-500 hover:bg-amber-500" },
  unpaid: { variant: "outline" },
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function InlineActionLoading({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-6 rounded-full bg-current/35 animate-pulse" />
      <span>{label}</span>
    </span>
  );
}

function getNextStatus(status: string): string | null {
  const flow: Record<string, string> = {
    pending: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: "served",
    served: "completed",
  };
  return flow[status] || null;
}

interface OrdersTableProps {
  orders: any[];
  isLoading: boolean;
  search: string;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  page: number;
  onPageChange: (page: number) => void;
  updateStatusPending: boolean;
  updatingOrderId?: string | null;
  updatingTargetStatus?: string | null;
  activeChargeOrderId?: string | null;
  onUpdateStatus: (id: string, status: string) => void;
  onPrintReceipt: (order: any) => void;
  onCharge?: (order: any) => void;
}

export function OrdersTable({
  orders,
  isLoading,
  search,
  pagination,
  page,
  onPageChange,
  updateStatusPending,
  updatingOrderId,
  updatingTargetStatus,
  activeChargeOrderId,
  onUpdateStatus,
  onPrintReceipt,
  onCharge,
}: OrdersTableProps) {
  const { t } = useTranslation();

  const filteredOrders = orders.filter((order: any) => {
    const orderNum = order.order_number || "";
    const customer = order.customer_name || "";
    const tableNum = order.table_number != null ? t("orders.tableNum").replace("{num}", String(order.table_number)) : "";
    return (
      orderNum.toLowerCase().includes(search.toLowerCase()) ||
      customer.toLowerCase().includes(search.toLowerCase()) ||
      tableNum.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("orders.headerOrder")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("orders.headerTable")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {t("orders.headerCustomer")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("common.status")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {t("orders.headerPayment")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {t("orders.headerItems")}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                    {t("common.total")}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden lg:table-cell">
                    {t("orders.headerTime")}
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="p-3 hidden sm:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                      <td className="p-3 hidden sm:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="p-3 hidden md:table-cell"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="p-3 hidden lg:table-cell"><Skeleton className="h-4 w-24 ml-auto" /></td>
                      <td className="p-3"><Skeleton className="h-7 w-20 mx-auto" /></td>
                    </tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                      {t("orders.noOrdersFound")}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order: any) => {
                    const config = statusConfig[order.status] || {
                      variant: "outline" as const,
                    };
                    const statusLabel = t("orders.status_" + order.status, order.status);
                    const nextStatus = getNextStatus(order.status);
                    const orderNum = order.order_number || order.id;
                    const table = order.table_number != null ? t("orders.tableNum").replace("{num}", String(order.table_number)) : "-";
                    const customer = order.customer_name || "";
                    const itemCount = order.item_count ?? 0;
                    const createdAt = order.created_at || "";
                    const paymentStatus = order.payment_status || "unpaid";
                    const payConfig = paymentStatusConfig[paymentStatus] || paymentStatusConfig.unpaid;
                    const paymentLabel = t("payments.status_" + paymentStatus, paymentStatus);
                    const isUpdatingThisOrder = updateStatusPending && updatingOrderId === order.id;
                    const isUpdatingCurrentStep =
                      isUpdatingThisOrder &&
                      !!nextStatus &&
                      updatingTargetStatus === nextStatus;
                    const isOpeningCharge = activeChargeOrderId === order.id;

                    return (
                      <tr
                        key={order.id}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-medium text-sm">{orderNum}</td>
                        <td className="p-3 text-sm">{table}</td>
                        <td className="p-3 text-sm hidden sm:table-cell">{customer}</td>
                        <td className="p-3">
                          <Badge variant={config.variant}>{statusLabel}</Badge>
                        </td>
                        <td className="p-3 hidden sm:table-cell">
                          <Badge variant={payConfig.variant} className={payConfig.className}>
                            {paymentLabel}
                          </Badge>
                          {paymentStatus === "partial" && order.total_paid != null && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {formatCurrency(order.total_paid)}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">
                          {itemCount} {t("orders.itemsCount")}
                        </td>
                        <td className="p-3 text-sm font-medium text-right">
                          {formatCurrency(order.total ?? 0)}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground text-right hidden lg:table-cell">
                          {createdAt ? formatDate(createdAt) : "-"}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {nextStatus && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="active:translate-y-px active:scale-[0.98]"
                                disabled={updateStatusPending}
                                onClick={() => onUpdateStatus(order.id, nextStatus)}
                              >
                                {isUpdatingCurrentStep ? (
                                  <InlineActionLoading label={t("orders.updating")} />
                                ) : (
                                  t("orders.status_" + nextStatus, nextStatus)
                                )}
                              </Button>
                            )}
                            {paymentStatus !== "paid" && onCharge && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="active:translate-y-px active:scale-[0.98]"
                                disabled={isOpeningCharge}
                                onClick={() => onCharge(order)}
                              >
                                {isOpeningCharge ? (
                                  <InlineActionLoading label={t("orders.opening")} />
                                ) : (
                                  <>
                                    <DollarSign className="h-3 w-3 mr-1" />
                                    {t("orders.charge")}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => onPrintReceipt(order)}
                              title={t("orders.printReceipt")}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("orders.totalOrders").replace("{total}", String(pagination.total))}
        </p>
        {pagination.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("orders.prev")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("orders.pageOf")
                .replace("{page}", String(pagination.page))
                .replace("{totalPages}", String(pagination.totalPages))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t("orders.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
