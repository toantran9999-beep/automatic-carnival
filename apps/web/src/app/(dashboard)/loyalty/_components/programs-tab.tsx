"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import {
  Plus,
  Star,
  Users,
  TrendingUp,
  Gift,
  Award,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useLoyaltyStats,
  useLoyaltyPrograms,
  useDeleteProgram,
  useDeleteTier,
} from "@/hooks/use-loyalty";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ProgramDialog } from "./program-dialog";
import { TierDialog } from "./tier-dialog";
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

function OnboardingGuide({ onCreateProgram }: { onCreateProgram: () => void }) {
  const { lang } = useTranslation();
  const steps = [
    {
      number: 1,
      title: lang === "vi" ? "Tạo chương trình" : "Create your program",
      description: lang === "vi" ? "Định nghĩa cách khách hàng tích điểm với mỗi đơn hàng. Thiết lập tỷ lệ điểm trên mỗi đơn vị chi tiêu." : "Define how your customers earn points with each purchase. Configure points rate per unit spent.",
      icon: Star, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30",
    },
    {
      number: 2,
      title: lang === "vi" ? "Đăng ký thành viên" : "Register members",
      description: lang === "vi" ? "Thêm thành viên thủ công hoặc để khách tự đăng ký khi quét mã QR tại bàn ăn." : "Add members manually or let them register automatically when scanning the table QR code.",
      icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      number: 3,
      title: lang === "vi" ? "Tích điểm tự động" : "Automatic points",
      description: lang === "vi" ? "Thành viên tích điểm tự động mỗi khi hoàn thành đơn hàng tại nhà hàng." : "Members accumulate points automatically whenever they complete an order.",
      icon: TrendingUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30",
    },
    {
      number: 4,
      title: lang === "vi" ? "Tạo phần thưởng" : "Create rewards",
      description: lang === "vi" ? "Định nghĩa giảm giá và ưu đãi mà thành viên có thể đổi bằng số điểm tích lũy." : "Define discounts and benefits members can redeem with their accumulated points.",
      icon: Gift, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Award className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {lang === "vi" ? "Thiết lập chương trình khách hàng thân thiết" : "Configure your loyalty program"}
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {lang === "vi"
            ? "Tặng thưởng cho khách hàng thường xuyên và tăng tỷ lệ giữ chân khách với hệ thống tích điểm dễ dùng."
            : "Reward frequent customers and increase retention with an easy-to-use points system."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((step) => (
          <Card key={step.number} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${step.bg}`}>
                  <step.icon className={`h-5 w-5 ${step.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {lang === "vi" ? `Bước ${step.number}` : `Step ${step.number}`}
                    </span>
                  </div>
                  <p className="font-medium text-sm text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex justify-center">
        <Button size="lg" onClick={onCreateProgram}>
          <Plus className="h-4 w-4 mr-2" />
          {lang === "vi" ? "Bắt đầu - Tạo Chương trình" : "Get Started - Create Program"}
        </Button>
      </div>
    </div>
  );
}

export function ProgramsTab() {
  const { t, lang } = useTranslation();
  const { data, isLoading } = useLoyaltyPrograms();
  const { data: stats } = useLoyaltyStats();
  const deleteProgram = useDeleteProgram();
  const deleteTier = useDeleteTier();

  const [showCreate, setShowCreate] = useState(false);
  const [editProgram, setEditProgram] = useState<any>(null);
  const [tierDialog, setTierDialog] = useState<{ open: boolean; programId: string; editData?: any }>({ open: false, programId: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);

  const programs: any[] = data ?? [];

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /></div>;
  }

  if (programs.length === 0) {
    return (
      <div className="space-y-4">
        <OnboardingGuide onCreateProgram={() => setShowCreate(true)} />
        <ProgramDialog open={showCreate} onOpenChange={setShowCreate} />
      </div>
    );
  }

  function handleDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "program") {
      deleteProgram.mutate(deleteConfirm.id, {
        onSuccess: () => {
          setDeleteConfirm(null);
          toast.success(lang === "vi" ? "Đã xóa chương trình" : "Program deleted");
        },
        onError: (err) => toast.error(`${t("common.error")}: ${(err as Error).message}`),
      });
    } else if (deleteConfirm.type === "tier") {
      deleteTier.mutate(deleteConfirm.id, {
        onSuccess: () => {
          setDeleteConfirm(null);
          toast.success(lang === "vi" ? "Đã xóa hạng thành viên" : "Tier deleted");
        },
        onError: (err) => toast.error(`${t("common.error")}: ${(err as Error).message}`),
      });
    }
  }

  const tierNameTranslate: Record<string, string> = {
    Bronce: lang === "vi" ? "Hạng Đồng" : "Bronze",
    Plata: lang === "vi" ? "Hạng Bạc" : "Silver",
    Oro: lang === "vi" ? "Hạng Vàng" : "Gold",
    Platino: lang === "vi" ? "Hạng Bạch Kim" : "Platinum",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("loyalty.addProgram")}
        </Button>
      </div>

      {programs.map((program: any) => {
        const exampleSpend = program.points_per_currency_unit > 0 && program.currency_per_point > 1000 ? 50000 : 50;
        const pointsEarned = exampleSpend * program.points_per_currency_unit;
        const pointValue = program.currency_per_point / 100;

        return (
          <Card key={program.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{program.name}</CardTitle>
                  <CardDescription>
                    {program.is_active
                      ? (lang === "vi" ? "Chương trình đang hoạt động" : "Active program")
                      : (lang === "vi" ? "Chương trình tạm ngưng" : "Inactive program")}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={program.is_active ? "default" : "secondary"}>
                    {program.is_active
                      ? (lang === "vi" ? "Hoạt động" : "Active")
                      : (lang === "vi" ? "Tạm ngưng" : "Inactive")}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => setEditProgram(program)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ type: "program", id: program.id, name: program.name })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">{lang === "vi" ? "Điểm tích lũy" : "Points per Currency"}</p>
                  <p className="text-2xl font-bold text-foreground">{program.points_per_currency_unit}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "vi" ? `cho mỗi ${formatCurrency(100)} chi tiêu` : `for each ${formatCurrency(100)} spent`}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">{lang === "vi" ? "Giá trị quy đổi" : "Point value"}</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(program.currency_per_point)}</p>
                  <p className="text-xs text-muted-foreground">{lang === "vi" ? "khi đổi phần thưởng" : "when redeeming rewards"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">{lang === "vi" ? "Thành viên tham gia" : "Enrolled members"}</p>
                  <p className="text-2xl font-bold text-foreground">{(stats?.totalCustomers ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{lang === "vi" ? "tổng số đăng ký" : "total registered"}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">{lang === "vi" ? "Thử tính điểm" : "Simulation"}</p>
                  <p className="text-sm text-foreground mt-1">
                    {lang === "vi" ? (
                      <>Chi tiêu <span className="font-bold">{formatCurrency(exampleSpend * 100)}</span> nhận <span className="font-bold text-primary">{pointsEarned} điểm</span></>
                    ) : (
                      <>Spend <span className="font-bold">{formatCurrency(exampleSpend * 100)}</span> earn <span className="font-bold text-primary">{pointsEarned} pts</span></>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    100 {lang === "vi" ? "điểm" : "pts"} = {formatCurrency(100 * pointValue * 100)}
                  </p>
                </div>
              </div>

              {/* Tiers section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{t("loyalty.tiers")}</p>
                  <Button variant="outline" size="sm" onClick={() => setTierDialog({ open: true, programId: program.id })}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t("loyalty.addTier")}
                  </Button>
                </div>
                {program.tiers && program.tiers.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {program.tiers.map((tier: any) => {
                      const tc = tierConfig[tier.name] || { label: tier.name, color: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300" };
                      const displayLabel = tierNameTranslate[tier.name] || tier.name;
                      return (
                        <div key={tier.id} className="rounded-lg border border-border bg-muted/20 p-3 group relative">
                          <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                            <button onClick={() => setTierDialog({ open: true, programId: program.id, editData: tier })} className="p-1 rounded hover:bg-muted">
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => setDeleteConfirm({ type: "tier", id: tier.id, name: tier.name })} className="p-1 rounded hover:bg-muted">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${tc.color}`}>
                            {displayLabel}
                          </span>
                          <p className="text-sm mt-2 text-foreground">
                            {tier.min_points.toLocaleString()} {lang === "vi" ? "điểm tối thiểu" : "pts minimum"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lang === "vi" ? "Hệ số nhân" : "Multiplier"}: {(tier.multiplier / 100).toFixed(2)}x
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {lang === "vi" ? "Chưa cấu hình hạng thành viên" : "No tiers configured"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ProgramDialog open={showCreate} onOpenChange={setShowCreate} />
      {editProgram && (
        <ProgramDialog open={!!editProgram} onOpenChange={(v) => { if (!v) setEditProgram(null); }} editData={editProgram} />
      )}
      {tierDialog.open && (
        <TierDialog
          open={tierDialog.open}
          onOpenChange={(v) => { if (!v) setTierDialog({ open: false, programId: "" }); }}
          programId={tierDialog.programId}
          editData={tierDialog.editData}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}
        title={t("loyalty.deleteConfirm")}
        description={
          lang === "vi"
            ? `Bạn có chắc chắn muốn xóa "${deleteConfirm?.name}" không? Hành động này không thể hoàn tác.`
            : `Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`
        }
        onConfirm={handleDelete}
        loading={deleteProgram.isPending || deleteTier.isPending}
      />
    </div>
  );
}
