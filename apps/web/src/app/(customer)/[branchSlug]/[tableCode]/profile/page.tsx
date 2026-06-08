"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useCustomerStore } from "@/stores/customer-store";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import {
  ArrowLeft,
  Star,
  Gift,
  TrendingUp,
  Loader2,
  CheckCircle,
  ShoppingBag,
  Ticket,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface LoyaltyData {
  points_balance: number;
  total_points_earned: number;
  program_name: string;
  tier_name: string | null;
  next_tier: { name: string; min_points: number } | null;
  rewards: Array<{
    id: string;
    name: string;
    description: string | null;
    points_cost: number;
    discount_type: string;
    discount_value: number;
  }>;
}

interface RedemptionData {
  id: string;
  reward_name: string;
  discount_type: string;
  discount_value: number;
  redeemed_at: string;
}

interface CouponData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  discount_value: number;
  expires_at: string | null;
}

interface OrderData {
  id: string;
  order_number: string;
  status: string;
  total: number | null;
  created_at: string;
  items: Array<{ id: string; name: string; quantity: number; status: string }>;
}

const orderStatusVariants: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
  preparing: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
  ready: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
  served: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
};

export default function ProfilePage({
  params,
}: {
  params: Promise<{ branchSlug: string; tableCode: string }>;
}) {
  const { branchSlug, tableCode } = use(params);
  const { t, lang } = useTranslation();

  const storeToken = useCustomerStore((s) => s.token);
  const storeCustomerName = useCustomerStore((s) => s.customerName);

  const [loading, setLoading] = useState(true);
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionData[]>([]);
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);

  // Redeem dialog
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<LoyaltyData["rewards"][0] | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ discount: { type: string; value: number }; newBalance: number } | null>(null);

  const customerName = storeCustomerName || (typeof window !== "undefined" ? sessionStorage.getItem("customer_name") : null);

  const orderStatusLabels: Record<string, string> = {
    pending: t("dashboard.status_pending"),
    confirmed: t("dashboard.status_confirmed"),
    preparing: t("dashboard.status_preparing"),
    ready: t("dashboard.status_ready"),
    served: t("dashboard.status_served"),
    completed: t("dashboard.status_completed"),
    cancelled: lang === "vi" ? "Đã hủy" : "Cancelled",
  };

  const getToken = useCallback(() => {
    if (storeToken) return storeToken;
    if (typeof window !== "undefined") return sessionStorage.getItem("customer_token");
    return null;
  }, [storeToken]);

  const fetchAll = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [loyaltyRes, couponsRes, ordersRes, redemptionsRes] = await Promise.all([
        fetch(`${API_URL}/api/customer/my-loyalty`, { headers }),
        fetch(`${API_URL}/api/customer/my-coupons`, { headers }),
        fetch(`${API_URL}/api/customer/my-orders`, { headers }),
        fetch(`${API_URL}/api/customer/my-redemptions`, { headers }),
      ]);

      const [loyaltyData, couponsData, ordersData, redemptionsData] = await Promise.all([
        loyaltyRes.json(),
        couponsRes.json(),
        ordersRes.json(),
        redemptionsRes.json(),
      ]);

      if (loyaltyData.success && loyaltyData.data) setLoyalty(loyaltyData.data);
      if (couponsData.success) setCoupons(couponsData.data || []);
      if (ordersData.success) setOrders(ordersData.data || []);
      if (redemptionsData.success) setRedemptions(redemptionsData.data || []);
    } catch {
      // Silently fail — partial data is fine
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRedeemClick = (reward: LoyaltyData["rewards"][0]) => {
    setSelectedReward(reward);
    setRedeemDialogOpen(true);
  };

  const handleConfirmRedeem = async () => {
    if (!selectedReward) return;
    const token = getToken();
    if (!token) return;

    try {
      setRedeeming(true);
      const res = await fetch(`${API_URL}/api/customer/redeem-reward`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardId: selectedReward.id }),
      });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error?.message || "Error al canjear");
      }

      setRedeemResult(result.data);
      setRedeemDialogOpen(false);
      setSuccessDialogOpen(true);

      // Re-fetch loyalty + redemptions
      const headers = { Authorization: `Bearer ${token}` };
      const [loyaltyRes, redemptionsRes] = await Promise.all([
        fetch(`${API_URL}/api/customer/my-loyalty`, { headers }),
        fetch(`${API_URL}/api/customer/my-redemptions`, { headers }),
      ]);
      const [loyaltyData, redemptionsData] = await Promise.all([
        loyaltyRes.json(),
        redemptionsRes.json(),
      ]);
      if (loyaltyData.success && loyaltyData.data) setLoyalty(loyaltyData.data);
      if (redemptionsData.success) setRedemptions(redemptionsData.data || []);
    } catch {
      // Error handled silently
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{lang === "vi" ? "Đang tải hồ sơ..." : "Loading profile..."}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href={`/${branchSlug}/${tableCode}/menu`}>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("customer.menu")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold flex-1">{t("customer.profile")}</h1>
      </div>

      {/* Customer info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">{customerName || (lang === "vi" ? "Khách hàng" : "Customer")}</p>
              <p className="text-sm text-muted-foreground">{t("connections.table")} {tableCode}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loyalty card */}
      {loyalty && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <p className="font-semibold text-sm">{loyalty.program_name}</p>
              {loyalty.tier_name && (
                <Badge variant="secondary" className="text-xs ml-auto">
                  {loyalty.tier_name}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-primary">
                {loyalty.points_balance.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">{t("loyalty.availablePoints")}</span>
            </div>

            {loyalty.next_tier && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{lang === "vi" ? `Tiến trình đạt ${loyalty.next_tier.name}` : `Progress to ${loyalty.next_tier.name}`}</span>
                  <span>
                    {loyalty.total_points_earned.toLocaleString()} / {loyalty.next_tier.min_points.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (loyalty.total_points_earned / loyalty.next_tier.min_points) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>{lang === "vi" ? "Tích lũy điểm với mỗi đơn hàng" : "Earn points with every order"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available rewards */}
      {loyalty && loyalty.rewards.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              {t("loyalty.availableRewards")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loyalty.rewards.map((reward) => {
              const canRedeem = loyalty.points_balance >= reward.points_cost;
              return (
                <div
                  key={reward.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    canRedeem
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30 opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{reward.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {reward.discount_type === "percentage"
                        ? `${reward.discount_value}% ${lang === "vi" ? "giảm giá" : "discount"}`
                        : `${formatCurrency(reward.discount_value)} ${lang === "vi" ? "giảm giá" : "discount"}`}
                    </p>
                  </div>
                  <div className="shrink-0 ml-3 flex flex-col items-end gap-1">
                    <p
                      className={cn(
                        "text-xs font-bold",
                        canRedeem ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {reward.points_cost.toLocaleString()} pts
                    </p>
                    {canRedeem ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => handleRedeemClick(reward)}
                      >
                        {t("loyalty.redeem")}
                      </Button>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        {lang === "vi" ? `Còn thiếu ${(reward.points_cost - loyalty.points_balance).toLocaleString()}` : `${(reward.points_cost - loyalty.points_balance).toLocaleString()} points needed`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Pending redemptions */}
      {redemptions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              {lang === "vi" ? "Đổi quà đang chờ xử lý" : "Pending Redemptions"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {redemptions.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-lg border border-green-500/20 bg-green-50 dark:bg-green-900/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{r.reward_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.discount_type === "percentage"
                      ? `${r.discount_value}% ${lang === "vi" ? "giảm giá" : "discount"}`
                      : `${formatCurrency(r.discount_value)} ${lang === "vi" ? "giảm giá" : "discount"}`}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20 shrink-0">
                  {t("dashboard.status_pending")}
                </Badge>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground text-center">
              {lang === "vi" ? "Sẽ tự động áp dụng trong đơn hàng tiếp theo từ giỏ hàng" : "Will be automatically applied to your next order from the cart"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Coupons */}
      {coupons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              {lang === "vi" ? "Mã giảm giá của tôi" : "My Coupons"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {coupon.code}
                    </Badge>
                    <p className="font-medium text-sm truncate">{coupon.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {coupon.type === "percentage"
                      ? `${coupon.discount_value}% ${lang === "vi" ? "giảm giá" : "discount"}`
                      : `${formatCurrency(coupon.discount_value)} ${lang === "vi" ? "giảm giá" : "discount"}`}
                    {coupon.expires_at && (
                      <> · {lang === "vi" ? "Hết hạn" : "Expires"} {new Date(coupon.expires_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")}</>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Orders */}
      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              {lang === "vi" ? "Đơn hàng của tôi" : "My Orders"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/${branchSlug}/${tableCode}/status`}
                className="block"
              >
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">#{order.order_number}</p>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                          orderStatusVariants[order.status] || "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {orderStatusLabels[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {order.total != null && (
                    <p className="font-semibold text-sm shrink-0 ml-3">
                      {formatCurrency(order.total)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No loyalty message */}
      {!loyalty && orders.length === 0 && coupons.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Star className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {lang === "vi" ? "Bạn chưa có hoạt động nào. Hãy đặt món để bắt đầu tích lũy điểm." : "No activity yet. Place an order to start earning points."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirm redeem dialog */}
      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("loyalty.redeemReward")}</DialogTitle>
            <DialogDescription>
              {selectedReward && loyalty && (
                <>
                  {lang === "vi" ? (
                    <>
                      Đổi <strong>{selectedReward.name}</strong> lấy{" "}
                      <strong>{selectedReward.points_cost.toLocaleString()} điểm</strong>?
                      <br />
                      Số dư điểm của bạn sẽ còn{" "}
                      <strong>
                        {(loyalty.points_balance - selectedReward.points_cost).toLocaleString()} điểm
                      </strong>
                    </>
                  ) : (
                    <>
                      Redeem <strong>{selectedReward.name}</strong> for{" "}
                      <strong>{selectedReward.points_cost.toLocaleString()} pts</strong>?
                      <br />
                      Your balance will be{" "}
                      <strong>
                        {(loyalty.points_balance - selectedReward.points_cost).toLocaleString()} pts
                      </strong>
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRedeemDialogOpen(false)}
              disabled={redeeming}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmRedeem} disabled={redeeming}>
              {redeeming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("loyalty.redeeming")}
                </>
              ) : (
                lang === "vi" ? "Xác nhận đổi" : "Confirm Redeem"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              {lang === "vi" ? "Đổi phần thưởng thành công" : "Reward Redeemed"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {redeemResult && (
                <>
                  {redeemResult.discount.type === "percentage"
                    ? `${redeemResult.discount.value}% ${lang === "vi" ? "giảm giá" : "discount"}`
                    : `${formatCurrency(redeemResult.discount.value)} ${lang === "vi" ? "giảm giá" : "discount"}`}
                  <br />
                  <span className="text-xs">
                    {lang === "vi" ? `Số dư hiện tại: ${redeemResult.newBalance.toLocaleString()} điểm` : `Current balance: ${redeemResult.newBalance.toLocaleString()} pts`}
                  </span>
                </>
              )}
              <br />
              <strong className="text-foreground text-sm mt-2 block">
                {lang === "vi" ? "Đến giỏ hàng để áp dụng giảm giá cho đơn hàng tiếp theo" : "Go to cart to apply discount on your next order"}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => setSuccessDialogOpen(false)}>
              {lang === "vi" ? "Đồng ý" : "Got it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
