"use client";

import { Users, Star, Gift, CheckCircle2 } from "lucide-react";
import { useLoyaltyStats } from "@/hooks/use-loyalty";
import { StatsGrid, StatCard, StatsGridSkeleton } from "@/components/stats-grid";
import { useTranslation } from "@/stores/lang-store";

export function LoyaltyStats() {
  const { t, lang } = useTranslation();
  const { data: stats, isLoading } = useLoyaltyStats();

  if (isLoading) {
    return <StatsGridSkeleton count={4} />;
  }

  return (
    <StatsGrid>
      <StatCard
        title={lang === "vi" ? "Khách hàng đã đăng ký" : "Registered Members"}
        value={(stats?.totalCustomers ?? 0).toLocaleString()}
        icon={Users}
        iconColor="text-blue-600 dark:text-blue-400"
        iconBg="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        title={lang === "vi" ? "Điểm đang lưu hành" : "Points in Circulation"}
        value={(stats?.totalPointsBalance ?? 0).toLocaleString()}
        icon={Star}
        iconColor="text-yellow-600 dark:text-yellow-400"
        iconBg="bg-yellow-100 dark:bg-yellow-900/30"
      />
      <StatCard
        title={lang === "vi" ? "Phần thưởng đã đổi" : "Rewards Redeemed"}
        value={(stats?.totalRedemptions ?? 0).toLocaleString()}
        icon={Gift}
        iconColor="text-green-600 dark:text-green-400"
        iconBg="bg-green-100 dark:bg-green-900/30"
      />
      <StatCard
        title={lang === "vi" ? "Chương trình đang hoạt động" : "Active Program"}
        value={stats?.activeProgram ? (lang === "vi" ? "Có" : "Yes") : "No"}
        icon={CheckCircle2}
        iconColor={
          stats?.activeProgram
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground"
        }
        iconBg={
          stats?.activeProgram
            ? "bg-emerald-100 dark:bg-emerald-900/30"
            : "bg-muted"
        }
      />
    </StatsGrid>
  );
}
