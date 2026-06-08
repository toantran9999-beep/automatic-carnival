"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@restai/ui/components/card";
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
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  Star,
  Trophy,
  Gift,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import {
  useLoyaltyCustomer,
  useCustomerTransactions,
  useLoyaltyRewards,
  useRedeemReward,
} from "@/hooks/use-loyalty";
import { formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useTranslation();
  const {
    data: customer,
    isLoading,
    error,
    refetch,
  } = useLoyaltyCustomer(id);
  const { data: transactionsData } = useCustomerTransactions(id);
  const { data: rewardsData } = useLoyaltyRewards();
  const redeemReward = useRedeemReward();

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [selectedRewardId, setSelectedRewardId] = useState("none");

  const transactions: any[] = transactionsData ?? [];
  const rewards: any[] = rewardsData ?? [];
  const loyalty = customer?.loyalty;

  const tierConfig: Record<string, { label: string; color: string }> = {
    Bronce: {
      label: lang === "vi" ? "Đồng" : "Bronze",
      color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    },
    Plata: {
      label: lang === "vi" ? "Bạc" : "Silver",
      color: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300",
    },
    Oro: {
      label: lang === "vi" ? "Vàng" : "Gold",
      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    },
    Platino: {
      label: lang === "vi" ? "Bạch kim" : "Platinum",
      color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    },
  };

  const txTypeConfig: Record<string, { label: string; color: string }> = {
    earned: {
      label: t("loyalty.earned"),
      color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    },
    redeemed: {
      label: t("loyalty.redeemed"),
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    },
    adjusted: {
      label: t("loyalty.adjusted"),
      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    },
    expired: {
      label: t("loyalty.expired"),
      color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    },
  };

  function handleRedeem() {
    if (!selectedRewardId || selectedRewardId === "none" || !loyalty?.id) return;
    redeemReward.mutate(
      { rewardId: selectedRewardId, customerLoyaltyId: loyalty.id },
      {
        onSuccess: () => {
          setRedeemOpen(false);
          setSelectedRewardId("none");
          toast.success(t("loyalty.rewardRedeemed"));
          refetch();
        },
        onError: (err) => {
          toast.error(`Error: ${(err as Error).message}`);
        },
      }
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/loyalty"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("loyalty.back")}
        </Link>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex items-center justify-between">
          <p className="text-sm text-destructive">
            {lang === "vi" ? "Lỗi tải thông tin thành viên: " : "Error loading customer: "}
            {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href="/loyalty"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("loyalty.back")}
        </Link>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <Link
          href="/loyalty"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("loyalty.back")}
        </Link>
        <p className="text-muted-foreground">
          {lang === "vi" ? "Không tìm thấy khách hàng" : "Customer not found"}
        </p>
      </div>
    );
  }

  const tierName = loyalty?.tier_name || "Bronce";
  const tier = tierConfig[tierName] || tierConfig.Bronce;

  return (
    <div className="space-y-6">
      <Link
        href="/loyalty"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t("loyalty.backToCustomers")}
      </Link>

      {/* Customer Info + Loyalty Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {customer.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.email && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {customer.email}
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {customer.phone}
              </div>
            )}
            {customer.birth_date && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {customer.birth_date}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("loyalty.memberSince")} {formatDate(customer.created_at)}
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                {t("loyalty.loyaltyPoints")}
              </CardTitle>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${tier.color}`}
              >
                {tier.label}
              </span>
            </div>
            {loyalty?.program_name && (
              <CardDescription>{loyalty.program_name}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loyalty ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-4xl font-bold text-foreground">
                    {(loyalty.points_balance || 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("loyalty.availablePoints")}
                  </p>
                </div>
                <div className="flex justify-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-medium text-foreground">
                      {(loyalty.total_points_earned || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("loyalty.totalEarned")}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button onClick={() => setRedeemOpen(true)} size="sm">
                    <Gift className="h-4 w-4 mr-2" />
                    {t("loyalty.redeemReward")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("loyalty.notEnrolled")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Redeem Rewards Section */}
      {loyalty && rewards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-5 w-5" />
              {t("loyalty.availableRewards")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((reward: any) => {
                const canRedeem =
                  (loyalty.points_balance || 0) >= reward.points_cost;
                return (
                  <div
                    key={reward.id}
                    className={`rounded-lg border border-border p-4 ${canRedeem ? "bg-muted/20" : "opacity-50"}`}
                  >
                    <p className="font-medium text-sm text-foreground">
                      {reward.name}
                    </p>
                    {reward.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {reward.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="secondary">
                        {reward.points_cost.toLocaleString()} pts
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {reward.discount_type === "percentage"
                          ? `${reward.discount_value}%`
                          : formatCurrency(reward.discount_value)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5" />
            {t("loyalty.pointsLedger")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    {t("loyalty.date")}
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">
                    {t("loyalty.type")}
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                    {t("loyalty.points")}
                  </th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    {lang === "vi" ? "Mô tả" : "Description"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      {t("loyalty.noTransactions")}
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx: any) => {
                    const txType =
                      txTypeConfig[tx.type] || txTypeConfig.adjusted;
                    const isPositive = tx.points > 0;
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-3 text-sm text-foreground">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${txType.color}`}
                          >
                            {txType.label}
                          </span>
                        </td>
                        <td className="p-3 text-sm font-medium text-right">
                          <span
                            className={`inline-flex items-center gap-1 ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {isPositive ? "+" : ""}
                            {tx.points.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                          {tx.description || "-"}
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

      {/* Redeem Dialog */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("loyalty.redeemReward")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("loyalty.pointsBalance")}:{" "}
              <span className="font-bold text-foreground">
                {(loyalty?.points_balance || 0).toLocaleString()}
              </span>
            </p>
            <Select value={selectedRewardId} onValueChange={setSelectedRewardId}>
              <SelectTrigger>
                <SelectValue placeholder={t("loyalty.selectReward")} />
              </SelectTrigger>
              <SelectContent>
                {rewards.map((r: any) => (
                  <SelectItem
                    key={r.id}
                    value={r.id}
                    disabled={
                      r.points_cost > (loyalty?.points_balance || 0)
                    }
                  >
                    {r.name} - {r.points_cost.toLocaleString()} pts
                    {r.points_cost > (loyalty?.points_balance || 0)
                      ? ` (${t("loyalty.insufficientPoints")})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRedeemOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={redeemReward.isPending || !selectedRewardId || selectedRewardId === "none"}
            >
              {redeemReward.isPending ? t("loyalty.redeeming") : t("loyalty.redeem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
