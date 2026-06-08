"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
} from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Plus, Gift, Award, Pencil, Trash2 } from "lucide-react";
import { useLoyaltyRewards, useLoyaltyPrograms, useDeleteReward } from "@/hooks/use-loyalty";
import { formatCurrency } from "@/lib/utils";
import { RewardDialog } from "./reward-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export function RewardsTab() {
  const { t, lang } = useTranslation();
  const { data: rewards, isLoading: rewardsLoading } = useLoyaltyRewards();
  const { data: programs } = useLoyaltyPrograms();
  const deleteReward = useDeleteReward();
  const [showDialog, setShowDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [deletingRewardId, setDeletingRewardId] = useState<string | null>(null);

  const rewardsList: any[] = rewards ?? [];
  const programsList: any[] = programs ?? [];
  const programId = programsList[0]?.id;

  function handleEdit(reward: any) {
    setEditingReward(reward);
    setShowDialog(true);
  }

  function handleCreate() {
    setEditingReward(null);
    setShowDialog(true);
  }

  function handleDelete() {
    if (!deletingRewardId) return;
    deleteReward.mutate(deletingRewardId, {
      onSuccess: () => {
        setDeletingRewardId(null);
        toast.success(lang === "vi" ? "Đã xóa phần thưởng" : "Reward deleted");
      },
      onError: (err) => toast.error(`${t("common.error")}: ${(err as Error).message}`),
    });
  }

  if (rewardsLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-5 w-32 mb-3" />
              <Skeleton className="h-4 w-48 mb-4" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={!programId}>
          <Plus className="h-4 w-4 mr-2" />{t("loyalty.addReward")}
        </Button>
      </div>

      {!programId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {lang === "vi" ? "Bạn cần tạo một chương trình tích điểm trước" : "You must create a loyalty program first"}
            </p>
          </CardContent>
        </Card>
      )}

      {rewardsList.length === 0 && programId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-1">
              {lang === "vi" ? "Chưa có phần thưởng nào được tạo" : "No rewards created"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "vi" ? "Tạo phần thưởng để khách hàng của bạn có thể đổi bằng điểm tích lũy" : "Create rewards for your customers to redeem their points"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rewardsList.map((reward: any) => (
          <Card key={reward.id} className="relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-bl-lg">
              <p className="text-sm font-bold">{reward.points_cost.toLocaleString()} {lang === "vi" ? "điểm" : "pts"}</p>
            </div>
            <CardContent className="p-5 pt-4">
              <div className="pr-20">
                <p className="font-semibold text-foreground">{reward.name}</p>
                {reward.description && <p className="text-xs text-muted-foreground mt-1">{reward.description}</p>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {reward.discount_type === "percentage"
                    ? `${reward.discount_value}% ${lang === "vi" ? "giảm giá" : "discount"}`
                    : `${formatCurrency(reward.discount_value)} ${lang === "vi" ? "giảm giá" : "discount"}`}
                </Badge>
                {reward.is_active ? (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                    {lang === "vi" ? "Hoạt động" : "Active"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">
                    {lang === "vi" ? "Tạm ngưng" : "Inactive"}
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(reward)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />{t("common.edit")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeletingRewardId(reward.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />{t("common.delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {programId && (
        <RewardDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          programId={programId}
          editData={editingReward}
        />
      )}

      <ConfirmDialog
        open={!!deletingRewardId}
        onOpenChange={(open) => { if (!open) setDeletingRewardId(null); }}
        title={lang === "vi" ? "Xóa phần thưởng" : "Delete Reward"}
        description={
          lang === "vi"
            ? "Nếu phần thưởng này đã có lượt đổi, hệ thống sẽ chuyển sang trạng thái tạm ngưng thay vì xóa."
            : "If the reward has redemptions, it will be deactivated instead of deleted."
        }
        onConfirm={handleDelete}
        confirmLabel={t("common.delete")}
        variant="destructive"
      />
    </div>
  );
}
