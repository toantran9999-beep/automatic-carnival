"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Plus, RefreshCw, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useLoyaltyCustomers, useDeleteCustomer } from "@/hooks/use-loyalty";
import { SearchInput } from "@/components/search-input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateCustomerDialog } from "./customer-dialog";
import { useTranslation } from "@/stores/lang-store";

const tierConfig: Record<string, { label: string; color: string }> = {
  Bronce: {
    label: "Bronce",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
  Plata: {
    label: "Plata",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300",
  },
  Oro: {
    label: "Oro",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  Platino: {
    label: "Platino",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export function CustomersTab() {
  const { t, lang } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedSearch(val), 300);
    setTimer(t);
  }

  const { data, isLoading, error, refetch } = useLoyaltyCustomers(debouncedSearch || undefined, page);
  const customers: any[] = data?.customers ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };
  const deleteCustomer = useDeleteCustomer();

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center justify-between">
        <p className="text-sm text-destructive">
          {lang === "vi" ? "Lỗi tải danh sách khách hàng" : "Error loading members"}: {(error as Error).message}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />{t("common.retry")}
        </Button>
      </div>
    );
  }

  const tierNameTranslate: Record<string, string> = {
    Bronce: lang === "vi" ? "Hạng Đồng" : "Bronze",
    Plata: lang === "vi" ? "Hạng Bạc" : "Silver",
    Oro: lang === "vi" ? "Hạng Vàng" : "Gold",
    Platino: lang === "vi" ? "Hạng Bạch Kim" : "Platinum",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={handleSearch}
          placeholder={lang === "vi" ? "Tìm theo tên, email hoặc số điện thoại..." : "Search by name, email, or phone..."}
          className="flex-1"
        />
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />{t("loyalty.addCustomer")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">{t("payments.client")}</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">{t("loyalty.phone")}</th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">{lang === "vi" ? "Hạng" : "Tier"}</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">{t("loyalty.points")}</th>
                  <th className="w-10 p-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="p-3 hidden sm:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-3"><Skeleton className="h-5 w-14 mx-auto rounded-full" /></td>
                      <td className="p-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="p-3" />
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                      {debouncedSearch
                        ? (lang === "vi" ? "Không tìm thấy khách hàng nào" : "No customers found")
                        : (lang === "vi" ? "Chưa có khách hàng nào đăng ký" : "No customers registered")}
                    </td>
                  </tr>
                ) : (
                  customers.map((customer: any) => {
                    const tierName = customer.tier_name || "Bronce";
                    const tier = tierConfig[tierName] || tierConfig.Bronce;
                    const displayLabel = tierNameTranslate[tierName] || tierName;
                    return (
                      <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-3">
                          <Link href={`/loyalty/${customer.id}`} className="block">
                            <p className="font-medium text-sm text-foreground">{customer.name}</p>
                            {customer.email && <p className="text-xs text-muted-foreground">{customer.email}</p>}
                          </Link>
                        </td>
                        <td className="p-3 text-sm text-foreground hidden sm:table-cell">{customer.phone || "-"}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${tier.color}`}>{displayLabel}</span>
                        </td>
                        <td className="p-3 text-sm font-medium text-right text-foreground">{(customer.points_balance || 0).toLocaleString()}</td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteConfirm({ id: customer.id, name: customer.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pagination.total} {lang === "vi" ? "khách hàng" : "customers"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              {lang === "vi" ? "Trước" : "Previous"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {lang === "vi" ? `Trang ${pagination.page} / ${pagination.totalPages}` : `Page ${pagination.page} of ${pagination.totalPages}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              {lang === "vi" ? "Sau" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateCustomerDialog open={showCreate} onOpenChange={setShowCreate} />

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => !v && setDeleteConfirm(null)}
        title={lang === "vi" ? "Xóa khách hàng" : "Delete Customer"}
        description={
          lang === "vi"
            ? `Sẽ xóa khách hàng "${deleteConfirm?.name}" và toàn bộ dữ liệu tích điểm (điểm tích lũy, giao dịch, mã giảm giá). Đơn hàng đã mua vẫn được giữ nguyên. Hành động này không thể hoàn tác.`
            : `This will delete "${deleteConfirm?.name}" and all loyalty data (points, ledger, coupons). Existing orders will be preserved. This action cannot be undone.`
        }
        confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteCustomer.mutate(deleteConfirm.id, {
              onSuccess: () => setDeleteConfirm(null),
            });
          }
        }}
        loading={deleteCustomer.isPending}
      />
    </div>
  );
}
