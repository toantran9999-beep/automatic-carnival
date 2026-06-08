"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
} from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Ticket,
  Copy,
  Tag,
  Send,
  Search,
} from "lucide-react";
import {
  useCoupons,
  useDeleteCoupon,
  useUpdateCoupon,
  useCouponAssignments,
  useAssignCoupon,
} from "@/hooks/use-coupons";
import { useLoyaltyCustomers } from "@/hooks/use-loyalty";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { CreateCouponDialog } from "./coupon-dialog";

import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function AssignCouponDialog({
  open,
  onOpenChange,
  coupon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: any;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const assignCoupon = useAssignCoupon();
  const { t, lang } = useTranslation();

  const { data: customersData, isLoading: customersLoading } = useLoyaltyCustomers(debouncedSearch || undefined);
  const { data: assignmentsData } = useCouponAssignments(coupon?.id || "");

  const customers: any[] = customersData?.customers ?? [];
  const assignments: any[] = assignmentsData ?? [];
  const assignedCustomerIds = new Set(assignments.map((a: any) => a.customer_id));

  function handleSearch(val: string) {
    setSearch(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedSearch(val), 300);
    setTimer(t);
  }

  function toggleCustomer(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleAssign() {
    if (selectedIds.length === 0) return;
    assignCoupon.mutate(
      { couponId: coupon.id, customerIds: selectedIds },
      {
        onSuccess: () => {
          setSelectedIds([]);
          toast.success(
            lang === "vi"
              ? `Đã giao mã giảm giá cho ${selectedIds.length} khách hàng`
              : `Coupon assigned to ${selectedIds.length} customer(s)`
          );
          onOpenChange(false);
        },
        onError: (err) => toast.error(`Error: ${(err as Error).message}`),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("loyalty.assignCoupon")}: {coupon?.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("loyalty.searchCustomers")}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Already assigned */}
          {assignments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t("loyalty.alreadyAssigned")} ({assignments.length}):
              </p>
              <div className="flex flex-wrap gap-1">
                {assignments.map((a: any) => (
                  <span
                    key={a.id}
                    className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
                  >
                    {a.customer_name || (lang === "vi" ? "Không có tên" : "No name")}
                    {a.seen_at && (lang === "vi" ? " (đã xem)" : " (seen)")}
                    {a.used_at && (lang === "vi" ? " (đã dùng)" : " (used)")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Customer list */}
          <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
            {customersLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t("loyalty.loading")}
              </div>
            ) : customers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {debouncedSearch ? t("loyalty.noResults") : t("loyalty.noCustomers")}
              </div>
            ) : (
              customers.map((cust: any) => {
                const alreadyAssigned = assignedCustomerIds.has(cust.id);
                const isSelected = selectedIds.includes(cust.id);
                return (
                  <button
                    key={cust.id}
                    disabled={alreadyAssigned}
                    onClick={() => toggleCustomer(cust.id)}
                    className={`w-full flex items-center justify-between p-3 text-left border-b border-border last:border-0 transition-colors ${
                      alreadyAssigned
                        ? "opacity-50 cursor-not-allowed bg-muted/30"
                        : isSelected
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{cust.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cust.phone || cust.email || (lang === "vi" ? "Không có liên hệ" : "No contact")}
                      </p>
                    </div>
                    {alreadyAssigned ? (
                      <span className="text-xs text-muted-foreground">{t("loyalty.alreadyAssigned")}</span>
                    ) : isSelected ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {selectedIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {lang === "vi"
                ? `Đã chọn ${selectedIds.length} khách hàng`
                : `${selectedIds.length} customer(s) selected`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleAssign}
            disabled={assignCoupon.isPending || selectedIds.length === 0}
          >
            {assignCoupon.isPending
              ? t("loyalty.assigning")
              : `${t("loyalty.assign")} (${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CouponsTab() {
  const { t, lang } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const { data, isLoading, error, refetch } = useCoupons({
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
  });
  const deleteCoupon = useDeleteCoupon();
  const updateCoupon = useUpdateCoupon();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [assignCouponData, setAssignCouponData] = useState<any>(null);

  const couponsList: any[] = data ?? [];

  const couponTypeLabels: Record<string, string> = {
    percentage: t("loyalty.couponTypePercentage"),
    fixed: t("loyalty.couponTypeFixed"),
    item_free: t("loyalty.couponTypeItemFree"),
    item_discount: t("loyalty.couponTypeItemDiscount"),
    category_discount: t("loyalty.couponTypeCategoryDiscount"),
    buy_x_get_y: t("loyalty.couponTypeBuyXGetY"),
  };

  const couponStatusLabels: Record<string, { label: string; color: string }> = {
    active: { label: lang === "vi" ? "Hoạt động" : "Active", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    inactive: { label: lang === "vi" ? "Ngưng hoạt động" : "Inactive", color: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300" },
    expired: { label: lang === "vi" ? "Hết hạn" : "Expired", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  };

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success(
      lang === "vi" ? `Đã sao chép mã "${code}"` : `Code "${code}" copied`
    );
  }

  function handleToggleStatus(coupon: any) {
    const newStatus = coupon.status === "active" ? "inactive" : "active";
    updateCoupon.mutate(
      { id: coupon.id, status: newStatus },
      {
        onSuccess: () =>
          toast.success(
            lang === "vi"
              ? `Mã giảm giá đã ${newStatus === "active" ? "kích hoạt" : "ngừng hoạt động"}`
              : `Coupon ${newStatus === "active" ? "activated" : "deactivated"}`
          ),
        onError: (err) => toast.error(`Error: ${(err as Error).message}`),
      },
    );
  }

  function handleDelete() {
    if (!deleteConfirm) return;
    deleteCoupon.mutate(deleteConfirm.id, {
      onSuccess: () => {
        setDeleteConfirm(null);
        toast.success(t("loyalty.couponDeleted"));
      },
      onError: (err) => toast.error(`Error: ${(err as Error).message}`),
    });
  }

  function formatCouponValue(coupon: any): string {
    switch (coupon.type) {
      case "percentage": return `${coupon.discount_value}% off`;
      case "fixed": return `${formatCurrency(coupon.discount_value)} off`;
      case "item_free": return lang === "vi" ? "Món miễn phí" : "Free Item";
      case "item_discount": return `${coupon.discount_value}% ${lang === "vi" ? "giảm cho món" : "off item"}`;
      case "category_discount": return `${coupon.discount_value}% ${lang === "vi" ? "giảm cho danh mục" : "off category"}`;
      case "buy_x_get_y": return `${lang === "vi" ? "Mua" : "Buy"} ${coupon.buy_quantity} ${lang === "vi" ? "Tặng" : "Get"} ${coupon.get_quantity}`;
      default: return "-";
    }
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center justify-between">
        <p className="text-sm text-destructive">
          {lang === "vi" ? "Lỗi khi tải mã giảm giá: " : "Error loading coupons: "}
          {(error as Error).message}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + Create */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("loyalty.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("loyalty.allStatuses")}</SelectItem>
            <SelectItem value="active">{lang === "vi" ? "Hoạt động" : "Active"}</SelectItem>
            <SelectItem value="inactive">{lang === "vi" ? "Ngưng hoạt động" : "Inactive"}</SelectItem>
            <SelectItem value="expired">{lang === "vi" ? "Hết hạn" : "Expired"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("loyalty.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("loyalty.allTypes")}</SelectItem>
            <SelectItem value="percentage">{t("loyalty.couponTypePercentage")}</SelectItem>
            <SelectItem value="fixed">{t("loyalty.couponTypeFixed")}</SelectItem>
            <SelectItem value="item_free">{t("loyalty.couponTypeItemFree")}</SelectItem>
            <SelectItem value="item_discount">{t("loyalty.couponTypeItemDiscount")}</SelectItem>
            <SelectItem value="category_discount">{t("loyalty.couponTypeCategoryDiscount")}</SelectItem>
            <SelectItem value="buy_x_get_y">{t("loyalty.couponTypeBuyXGetY")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("loyalty.createCoupon")}
          </Button>
        </div>
      </div>

      {/* Coupon cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : couponsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-1">{t("loyalty.noCoupons")}</p>
            <p className="text-xs text-muted-foreground">{t("loyalty.createCouponsHelp")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {couponsList.map((coupon: any) => {
            const statusInfo = couponStatusLabels[coupon.status] || couponStatusLabels.inactive;
            const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
            return (
              <Card key={coupon.id} className="relative overflow-hidden">
                {/* Coupon-style dashed border top */}
                <div className="border-b-2 border-dashed border-border" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => handleCopyCode(coupon.code)}
                          className="flex items-center gap-1 font-mono text-sm font-bold text-primary hover:text-primary/80 transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          {coupon.code}
                        </button>
                      </div>
                      <p className="font-medium text-foreground text-sm">{coupon.name}</p>
                      {coupon.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{coupon.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setAssignCouponData(coupon)}
                        className="p-1.5 rounded hover:bg-muted"
                        title={t("loyalty.assignToCustomers")}
                      >
                        <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(coupon)}
                        className="p-1.5 rounded hover:bg-muted"
                        title={coupon.status === "active" ? t("loyalty.deactivate") : t("loyalty.activate")}
                      >
                        <CheckCircle2 className={`h-4 w-4 ${coupon.status === "active" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                      </button>
                      <button onClick={() => setDeleteConfirm({ id: coupon.id, name: coupon.name })} className="p-1.5 rounded hover:bg-muted">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>
                      {isExpired ? (lang === "vi" ? "Hết hạn" : "Expired") : statusInfo.label}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      <Tag className="h-3 w-3 mr-1" />
                      {couponTypeLabels[coupon.type] || coupon.type}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-bold">
                      {formatCouponValue(coupon)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t("loyalty.uses")} {coupon.current_uses}{coupon.max_uses_total ? `/${coupon.max_uses_total}` : ` (${lang === "vi" ? "không gh." : "unlim."})`}
                    </span>
                    {coupon.min_order_amount > 0 && (
                      <span>Min: {formatCurrency(coupon.min_order_amount)}</span>
                    )}
                  </div>

                  {(coupon.starts_at || coupon.expires_at) && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {coupon.starts_at && (
                        <span>{t("loyalty.since")} {new Date(coupon.starts_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")} </span>
                      )}
                      {coupon.expires_at && (
                        <span>{t("loyalty.until")} {new Date(coupon.expires_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateCouponDialog open={showCreate} onOpenChange={setShowCreate} />

      {assignCouponData && (
        <AssignCouponDialog
          open={!!assignCouponData}
          onOpenChange={(v) => { if (!v) setAssignCouponData(null); }}
          coupon={assignCouponData}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}
        title={t("loyalty.deleteCouponTitle")}
        description={`${t("loyalty.deleteCouponConfirm")} (${deleteConfirm?.name})`}
        onConfirm={handleDelete}
        loading={deleteCoupon.isPending}
      />
    </div>
  );
}
