"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Skeleton } from "@restai/ui/components/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useOrgSettings,
  useUpdateOrg,
  useBranchSettings,
  useUpdateBranch,
} from "@/hooks/use-settings";
import { useUploadImage } from "@/hooks/use-uploads";
import { useTranslation } from "@/stores/lang-store";
import {
  SettingSection,
  SettingRow,
  SettingsSaveBar,
} from "@/components/settings/setting-row";

/**
 * "Quán" — mọi thứ nhận dạng quán: tên tổ chức, logo, và thông tin chi nhánh
 * đang chọn (địa chỉ, SĐT, múi giờ, tiền tệ, thuế).
 *
 * Gộp tab "Tổ chức" + phần đầu tab "Chi nhánh" cũ. Lý do gộp: chủ quán đọc
 * "Tổ chức" và "Chi nhánh" không biết tên quán nằm ở đâu — thực tế nằm cả hai.
 *
 * ⚠️ Trang này CHỈ gửi các trường của nó. An toàn vì `PATCH /settings/branch`
 * gộp từng trường (chỉ áp dụng khi `!== undefined`), nên lưu ở đây KHÔNG xoá
 * công tắc bên trang "Màn bán hàng" hay mẫu phiếu bên "In ấn".
 */

const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "UTC"];

export default function ShopSettingsPage() {
  const { t } = useTranslation();
  const { data: orgData, isLoading: orgLoading } = useOrgSettings();
  const { data: branchData, isLoading: branchLoading } = useBranchSettings();
  const updateOrg = useUpdateOrg();
  const updateBranch = useUpdateBranch();
  const uploadImage = useUploadImage();
  const logoFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    orgName: "",
    logoUrl: "",
    branchName: "",
    address: "",
    phone: "",
    taxRate: "10.00",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
  });

  useEffect(() => {
    if (!orgData) return;
    setForm((f) => ({ ...f, orgName: orgData.name || "", logoUrl: orgData.logo_url || "" }));
  }, [orgData]);

  useEffect(() => {
    if (!branchData) return;
    setForm((f) => ({
      ...f,
      branchName: branchData.name || "",
      address: branchData.address || "",
      phone: branchData.phone || "",
      taxRate: ((branchData.tax_rate ?? 1000) / 100).toFixed(2),
      timezone: branchData.timezone || "Asia/Ho_Chi_Minh",
      currency: branchData.currency || "VND",
    }));
  }, [branchData]);

  const isLoading = orgLoading || branchLoading;
  const saving = updateOrg.isPending || updateBranch.isPending;

  const handleSave = async () => {
    try {
      await updateOrg.mutateAsync({ name: form.orgName, logoUrl: form.logoUrl || null });
      await updateBranch.mutateAsync({
        name: form.branchName,
        address: form.address,
        phone: form.phone,
        taxRate: Math.round(parseFloat(form.taxRate) * 100),
        timezone: form.timezone,
        currency: form.currency,
      });
      toast.success(t("settings.orgSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingSection
          title={t("settings.orgTitle")}
          description={t("settings.orgDesc")}
        >
          <SettingRow label={t("settings.orgNameLabel")} htmlFor="orgName" stacked>
            <Input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("settings.logoLabel")} help={t("settings.logoHelp")} stacked>
            <div className="flex items-center gap-4">
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt={t("settings.logoLabel")}
                  className="h-20 w-20 rounded-lg border border-border object-cover"
                />
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => logoFileRef.current?.click()}
                disabled={uploadImage.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadImage.isPending
                  ? t("settings.uploading")
                  : form.logoUrl
                    ? t("settings.changeLogo")
                    : t("settings.uploadLogo")}
              </Button>
              <input
                ref={logoFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = await uploadImage.mutateAsync({ file, type: "logo" });
                    setForm((f) => ({ ...f, logoUrl: result.url }));
                    toast.success(t("settings.logoSuccess"));
                  } catch (err: any) {
                    toast.error(err.message || t("settings.logoError"));
                  }
                  if (logoFileRef.current) logoFileRef.current.value = "";
                }}
              />
            </div>
          </SettingRow>
        </SettingSection>

        <SettingSection
          title={t("settings.branchTitle")}
          description={t("settings.branchDesc")}
        >
          <SettingRow label={t("settings.branchNameLabel")} htmlFor="branchName" stacked>
            <Input
              id="branchName"
              value={form.branchName}
              onChange={(e) => setForm({ ...form, branchName: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("settings.phoneLabel")} htmlFor="branchPhone" stacked>
            <Input
              id="branchPhone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("settings.addressLabel")} htmlFor="branchAddress" stacked>
            <Input
              id="branchAddress"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("settings.timezoneLabel")} stacked>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm({ ...form, timezone: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings.selectTimezone")} />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t("settings.currencyLabel")} stacked>
            <Select
              value={form.currency}
              onValueChange={(v) => setForm({ ...form, currency: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings.selectCurrency")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VND">VND (đ)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            label={t("settings.taxLabel")}
            help={t("settings.taxHelp")}
            htmlFor="branchTaxRate"
            stacked
          >
            <Input
              id="branchTaxRate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
            />
          </SettingRow>
        </SettingSection>
      </div>

      <SettingsSaveBar
        onSave={handleSave}
        saving={saving}
        savingLabel={t("settings.saving")}
        saveLabel={t("settings.saveChanges")}
      />
    </div>
  );
}
