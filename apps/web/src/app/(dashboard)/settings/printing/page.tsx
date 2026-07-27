"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Skeleton } from "@restai/ui/components/skeleton";
import { Switch } from "@restai/ui/components/switch";
import { toast } from "sonner";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { useTranslation } from "@/stores/lang-store";
import {
  SettingSection,
  SettingRow,
  SettingsSaveBar,
} from "@/components/settings/setting-row";
import { ReceiptTab } from "../_components/receipt-tab";

/**
 * "In ấn" — MỘT chỗ duy nhất cho mọi thứ liên quan tới in.
 *
 * Trước đây rải ba tab: "Chi nhánh" giữ kiểu in + cổng in, "Hóa đơn" giữ mẫu
 * phiếu, "Thiết bị này" giữ trạm quầy. Chủ quán muốn đổi cách in phải đoán vào
 * tab nào. Giờ kiểu in + cổng in + mẫu phiếu nằm chung; chỉ còn trạm quầy ở
 * "Thiết bị này" vì cái đó lưu TRÊN MÁY, không phải cài đặt chi nhánh.
 *
 * ⚠️ CỐ Ý dùng lại `ReceiptTab` nguyên vẹn (618 dòng, đã tự chia mục Chung/Hóa
 * đơn/Phiếu đặt món/Phiếu tạm tính) thay vì viết lại theo khuôn SettingRow: viết
 * lại từng đó trường thì nguy cơ rơi mất một mục cấu hình phiếu là rất thật, mà
 * đó là thứ phải tránh nhất. Nó đã dùng chung `Switch` rồi.
 */
export default function PrintingSettingsPage() {
  const { t } = useTranslation();
  const { data: branchData, isLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();

  const [form, setForm] = useState({
    printMode: "combined" as "combined" | "per_item",
    printDriver: "browser_print" as "browser_print" | "rawbt_intent" | "android_bridge",
    autoPrintReceiptOnPaid: true,
  });

  useEffect(() => {
    if (!branchData) return;
    const s = branchData.settings ?? {};
    setForm({
      printMode: s.print_mode === "per_item" ? "per_item" : "combined",
      printDriver: ["rawbt_intent", "android_bridge"].includes(s.print_driver)
        ? s.print_driver
        : "browser_print",
      // Chưa có khóa trong settings = quán chưa từng đụng tới → mặc định BẬT.
      autoPrintReceiptOnPaid: s.auto_print_receipt_on_paid !== false,
    });
  }, [branchData]);

  const handleSave = async () => {
    try {
      await updateBranch.mutateAsync({
        printMode: form.printMode,
        printDriver: form.printDriver,
        autoPrintReceiptOnPaid: form.autoPrintReceiptOnPaid,
      });
      toast.success(t("settings.branchSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError"));
    }
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <SettingSection
            title={t("settings.printerTitle", "Máy in")}
            description={t(
              "settings.printerDesc",
              "Cách phiếu được in ra và in qua đường nào.",
            )}
          >
            <SettingRow
              label={t("settings.printModeLabel")}
              help={t("settings.printModeHelp")}
              stacked
            >
              <Select
                value={form.printMode}
                onValueChange={(v) =>
                  setForm({ ...form, printMode: v as "combined" | "per_item" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">{t("settings.printModeCombined")}</SelectItem>
                  <SelectItem value="per_item">{t("settings.printModePerItem")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              label={t("settings.printDriverLabel")}
              help={t("settings.printDriverHelp")}
              stacked
            >
              <Select
                value={form.printDriver}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    printDriver: v as "browser_print" | "rawbt_intent" | "android_bridge",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser_print">{t("settings.printDriverBrowser")}</SelectItem>
                  <SelectItem value="rawbt_intent">{t("settings.printDriverRawbt")}</SelectItem>
                  <SelectItem value="android_bridge">{t("settings.printDriverBridge")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              label="Tự in hóa đơn khi tiền về"
              help="Khách quét QR trả xong, Trạm quầy tự in hóa đơn — thu ngân không phải bấm. Tắt nếu quán chỉ in khi khách hỏi."
            >
              <Switch
                checked={form.autoPrintReceiptOnPaid}
                onCheckedChange={(v) => setForm({ ...form, autoPrintReceiptOnPaid: v })}
              />
            </SettingRow>
          </SettingSection>

          <SettingsSaveBar
            onSave={handleSave}
            saving={updateBranch.isPending}
            savingLabel={t("settings.saving")}
            saveLabel={t("settings.saveChanges")}
          />
        </>
      )}

      {/* Mẫu phiếu — có nút Lưu riêng bên trong. */}
      <ReceiptTab />
    </div>
  );
}
