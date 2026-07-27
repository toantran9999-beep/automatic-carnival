"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Switch } from "@restai/ui/components/switch";
import { Skeleton } from "@restai/ui/components/skeleton";
import { toast } from "sonner";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { useTranslation } from "@/stores/lang-store";
import {
  SettingSection,
  SettingRow,
  SettingsSaveBar,
} from "@/components/settings/setting-row";

/**
 * "Màn bán hàng" — các công tắc bật/tắt tính năng nhân viên nhìn thấy khi bán.
 *
 * Trước đây nằm lẫn giữa thuế, múi giờ và cấu hình in trong một file 407 dòng.
 * Gom về đây vì chúng cùng một loại câu hỏi: "màn bán hàng hiện cái gì?".
 *
 * ⚠️ Chỉ gửi các trường của trang này — `PATCH /settings/branch` gộp từng trường
 * nên không đụng tới mẫu phiếu hay thông tin quán.
 */
export default function PosSettingsPage() {
  const { t } = useTranslation();
  const { data: branchData, isLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();

  const [form, setForm] = useState({
    hidePosNav: false,
    hideTableQr: false,
    inventoryEnabled: false,
    waiterTableAssignmentEnabled: false,
    showBestSellers: true,
    bestSellersLimit: "10",
    bestSellersDays: "30",
  });

  useEffect(() => {
    if (!branchData) return;
    const s = branchData.settings ?? {};
    setForm({
      hidePosNav: s.hide_pos_nav ?? false,
      hideTableQr: s.hide_table_qr ?? false,
      inventoryEnabled: s.inventory_enabled ?? false,
      waiterTableAssignmentEnabled: s.waiter_table_assignment_enabled ?? false,
      // Chưa có khóa = BẬT (tính năng mặc định bật sẵn).
      showBestSellers: s.show_best_sellers ?? true,
      bestSellersLimit: String(s.best_sellers_limit ?? 10),
      bestSellersDays: String(s.best_sellers_days ?? 30),
    });
  }, [branchData]);

  const handleSave = async () => {
    try {
      await updateBranch.mutateAsync({
        hidePosNav: form.hidePosNav,
        hideTableQr: form.hideTableQr,
        inventoryEnabled: form.inventoryEnabled,
        waiterTableAssignmentEnabled: form.waiterTableAssignmentEnabled,
        showBestSellers: form.showBestSellers,
        bestSellersLimit: Math.min(Math.max(parseInt(form.bestSellersLimit, 10) || 10, 3), 30),
        bestSellersDays: Math.min(Math.max(parseInt(form.bestSellersDays, 10) || 30, 1), 365),
      });
      toast.success(t("settings.branchSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingSection
          title={t("settings.posDisplayTitle", "Hiện gì trên màn bán hàng")}
          description={t(
            "settings.posDisplayDesc",
            "Bật/tắt các mục nhân viên nhìn thấy khi bán hàng.",
          )}
        >
          <SettingRow
            label={t("settings.hidePosNav", 'Ẩn mục "POS (Bán hàng)" trên menu')}
            help={t(
              "settings.hidePosNavHelp",
              "Nhân viên vào bán hàng qua màn Bàn ăn: chọn bàn hoặc Mang về là mở POS. Menu gọn hơn, tránh mở POS khi chưa chọn bàn.",
            )}
          >
            <Switch
              checked={form.hidePosNav}
              onCheckedChange={(v) => setForm({ ...form, hidePosNav: v })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.hideTableQr", "Ẩn nút QR trên thẻ bàn")}
            help={t(
              "settings.hideTableQrHelp",
              "Quán chưa dùng luồng khách tự quét QR gọi món — ẩn để thẻ bàn gọn hơn. Tắt lại khi muốn dùng.",
            )}
          >
            <Switch
              checked={form.hideTableQr}
              onCheckedChange={(v) => setForm({ ...form, hideTableQr: v })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.waiterAssignment")}
            help={t("settings.waiterAssignmentHelp")}
          >
            <Switch
              checked={form.waiterTableAssignmentEnabled}
              onCheckedChange={(v) => setForm({ ...form, waiterTableAssignmentEnabled: v })}
            />
          </SettingRow>
          <SettingRow
            label={t("settings.inventoryControl")}
            help={t("settings.inventoryHelp")}
          >
            <Switch
              checked={form.inventoryEnabled}
              onCheckedChange={(v) => setForm({ ...form, inventoryEnabled: v })}
            />
          </SettingRow>
        </SettingSection>

        <SettingSection
          title={t("settings.bestSellersTitle", "Nhóm Bán chạy")}
          description={t(
            "settings.showBestSellersHelp",
            "Gom các món khách hay gọi nhất lên đầu để nhân viên bấm nhanh. Tự ẩn khi quán chưa có dữ liệu bán hàng.",
          )}
        >
          <SettingRow label={t("settings.showBestSellers", 'Hiện nhóm "Bán chạy"')}>
            <Switch
              checked={form.showBestSellers}
              onCheckedChange={(v) => setForm({ ...form, showBestSellers: v })}
            />
          </SettingRow>
          {/* Hai ô số chỉ hiện khi đã bật — không bắt đọc thứ không dùng tới. */}
          {form.showBestSellers && (
            <>
              <SettingRow
                label={t("settings.bestSellersLimit", "Số món hiện")}
                help={t("settings.bestSellersLimitHelp", "Từ 3 đến 30 món.")}
                htmlFor="bestSellersLimit"
              >
                <Input
                  id="bestSellersLimit"
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={30}
                  className="w-24 text-center tabular-nums"
                  value={form.bestSellersLimit}
                  onChange={(e) => setForm({ ...form, bestSellersLimit: e.target.value })}
                />
              </SettingRow>
              <SettingRow
                label={t("settings.bestSellersDays", "Tính theo số ngày gần đây")}
                help={t("settings.bestSellersDaysHelp", "Từ 1 đến 365 ngày.")}
                htmlFor="bestSellersDays"
              >
                <Input
                  id="bestSellersDays"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  className="w-24 text-center tabular-nums"
                  value={form.bestSellersDays}
                  onChange={(e) => setForm({ ...form, bestSellersDays: e.target.value })}
                />
              </SettingRow>
            </>
          )}
        </SettingSection>
      </div>

      <SettingsSaveBar
        onSave={handleSave}
        saving={updateBranch.isPending}
        savingLabel={t("settings.saving")}
        saveLabel={t("settings.saveChanges")}
      />
    </div>
  );
}
