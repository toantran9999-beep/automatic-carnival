"use client";

import { useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Switch } from "@restai/ui/components/switch";
import { Plus, Pencil, Store } from "lucide-react";
import { VN_BANKS, resolveBankBin } from "@restai/config";
import { useBranches, useCreateBranch, useUpdateBranchById } from "@/hooks/use-settings";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function SedesTab() {
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const createBranch = useCreateBranch();
  const updateBranchById = useUpdateBranchById();
  const { t } = useTranslation();

  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchDialogForm, setBranchDialogForm] = useState({
    name: "",
    slug: "",
    address: "",
    phone: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    webhookSecret: "",
    momoEnabled: false,
    momoEnv: "production" as "test" | "production",
    momoPartnerCode: "",
    momoAccessKey: "",
    momoSecretKey: "",
    /** Máy chủ đã có khóa rồi → ô để trống nghĩa là "giữ nguyên", không phải "xoá". */
    momoSecretKeySet: false,
    sepaySecretSet: false,
  });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const openCreateBranchDialog = () => {
    setEditingBranch(null);
    setBranchDialogForm({
      name: "",
      slug: "",
      address: "",
      phone: "",
      bankCode: "",
      accountNumber: "",
      accountName: "",
      webhookSecret: "",
      momoEnabled: false,
      momoEnv: "production",
      momoPartnerCode: "",
      momoAccessKey: "",
      momoSecretKey: "",
      momoSecretKeySet: false,
      sepaySecretSet: false,
    });
    setSlugManuallyEdited(false);
    setBranchDialogOpen(true);
  };

  const openEditBranchDialog = (branch: any) => {
    const sepay = branch.settings?.payment?.sepay || branch.settings?.sepay || {};
    const momo = branch.settings?.payment?.momo || {};
    setEditingBranch(branch);
    setBranchDialogForm({
      name: branch.name || "",
      slug: branch.slug || "",
      address: branch.address || "",
      phone: branch.phone || "",
      bankCode: sepay.bank_code || sepay.bankCode || "",
      accountNumber: sepay.account_number || sepay.accountNumber || "",
      accountName: sepay.account_name || sepay.accountName || "",
      // Khóa bí mật KHÔNG còn được máy chủ trả về — chỉ có cờ cho biết đã đặt hay chưa.
      webhookSecret: "",
      momoEnabled: Boolean(momo.enabled),
      momoEnv: momo.env === "test" ? "test" : "production",
      momoPartnerCode: momo.partner_code || "",
      momoAccessKey: momo.access_key || "",
      momoSecretKey: "",
      momoSecretKeySet: Boolean(momo.secret_key_set),
      sepaySecretSet: Boolean(sepay.webhook_secret_set),
    });
    setSlugManuallyEdited(true);
    setBranchDialogOpen(true);
  };

  const handleBranchDialogSave = async () => {
    try {
      const currentSettings = editingBranch?.settings || {};
      const paymentSettings = {
        ...(currentSettings.payment || {}),
        sepay: {
          // Luôn lưu về mã BIN 6 số cho chuẩn VietQR; nếu chưa nhận diện được thì
          // giữ nguyên chuỗi cũ để không mất dữ liệu người dùng đã nhập.
          bank_code:
            resolveBankBin(branchDialogForm.bankCode) || branchDialogForm.bankCode.trim(),
          account_number: branchDialogForm.accountNumber.trim(),
          account_name: branchDialogForm.accountName.trim(),
          // Để trống = giữ khóa cũ. Máy chủ (mergeBranchSecrets) lo phần ghép lại.
          webhook_secret: branchDialogForm.webhookSecret.trim(),
        },
        momo: {
          enabled: branchDialogForm.momoEnabled,
          env: branchDialogForm.momoEnv,
          partner_code: branchDialogForm.momoPartnerCode.trim(),
          access_key: branchDialogForm.momoAccessKey.trim(),
          secret_key: branchDialogForm.momoSecretKey.trim(),
        },
      };
      const settings = {
        ...currentSettings,
        payment: paymentSettings,
      };
      if (editingBranch) {
        await updateBranchById.mutateAsync({
          id: editingBranch.id,
          name: branchDialogForm.name,
          slug: branchDialogForm.slug,
          address: branchDialogForm.address,
          phone: branchDialogForm.phone,
          settings,
        });
        toast.success(t("settings.branchSuccess"));
      } else {
        await createBranch.mutateAsync({
          name: branchDialogForm.name,
          slug: branchDialogForm.slug,
          address: branchDialogForm.address || undefined,
          phone: branchDialogForm.phone || undefined,
          settings,
        });
        toast.success(t("settings.createBranchSuccess"));
      }
      setBranchDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || t("settings.saveBranchError"));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("settings.branchesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.branchesDesc")}</p>
        </div>
        <Button size="sm" onClick={openCreateBranchDialog}>
          <Plus className="h-4 w-4 mr-2" />
          {t("settings.newBranch")}
        </Button>
      </div>

      {branchesLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !branches || branches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("settings.noBranches")}</p>
            <Button className="mt-4" size="sm" onClick={openCreateBranchDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {t("settings.createFirstBranch")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {branches.map((branch: any) => (
            <Card key={branch.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary border border-primary/20">
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{branch.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{branch.slug}</span>
                        {branch.address && <span>· {branch.address}</span>}
                        {branch.phone && <span>· {branch.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditBranchDialog(branch)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBranch ? t("settings.editBranch") : t("settings.newBranch")}</DialogTitle>
            <DialogDescription>
              {editingBranch ? t("settings.branchDialogDescEdit") : t("settings.branchDialogDescCreate")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dialogBranchName">{t("settings.orgNameLabel")}</Label>
              <Input
                id="dialogBranchName"
                placeholder="Chi nhánh mới"
                value={branchDialogForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setBranchDialogForm({
                    ...branchDialogForm,
                    name,
                    slug: slugManuallyEdited ? branchDialogForm.slug : slugify(name),
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialogBranchSlug">{t("settings.slugLabel")}</Label>
              <Input
                id="dialogBranchSlug"
                placeholder="chi-nhanh-moi"
                value={branchDialogForm.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setBranchDialogForm({ ...branchDialogForm, slug: e.target.value });
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.slugHelp")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialogBranchAddress">{t("settings.addressLabel")}</Label>
              <Input
                id="dialogBranchAddress"
                placeholder="123 Đường chính"
                value={branchDialogForm.address}
                onChange={(e) => setBranchDialogForm({ ...branchDialogForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialogBranchPhone">{t("settings.phoneLabel")}</Label>
              <Input
                id="dialogBranchPhone"
                placeholder="+84..."
                value={branchDialogForm.phone}
                onChange={(e) => setBranchDialogForm({ ...branchDialogForm, phone: e.target.value })}
              />
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div>
                <p className="text-sm font-semibold">Thanh toán chuyển khoản</p>
                <p className="text-xs text-muted-foreground">Dùng cho QR tạm tính và webhook SePay của chi nhánh này.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dialogBankCode">Ngân hàng</Label>
                  {/* Chọn từ danh sách và lưu MÃ BIN 6 số — chuẩn VietQR bắt buộc dùng BIN,
                      gõ tay tên ngân hàng sẽ tạo ra mã QR không quét được. */}
                  <Select
                    value={resolveBankBin(branchDialogForm.bankCode) || ""}
                    onValueChange={(v) => setBranchDialogForm({ ...branchDialogForm, bankCode: v })}
                  >
                    <SelectTrigger id="dialogBankCode">
                      <SelectValue placeholder="Chọn ngân hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      {VN_BANKS.map((bank) => (
                        <SelectItem key={bank.bin} value={bank.bin}>
                          {bank.name} ({bank.bin})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {branchDialogForm.bankCode && !resolveBankBin(branchDialogForm.bankCode) && (
                    <p className="text-xs text-destructive">
                      Chưa nhận diện được &quot;{branchDialogForm.bankCode}&quot; — hãy chọn lại ngân hàng
                      trong danh sách, nếu không mã QR sẽ không quét được.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dialogAccountNumber">Số tài khoản</Label>
                  <Input
                    id="dialogAccountNumber"
                    placeholder="0123456789"
                    value={branchDialogForm.accountNumber}
                    onChange={(e) => setBranchDialogForm({ ...branchDialogForm, accountNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialogAccountName">Tên người nhận</Label>
                <Input
                  id="dialogAccountName"
                  placeholder="CONG TY / CHU TAI KHOAN"
                  value={branchDialogForm.accountName}
                  onChange={(e) => setBranchDialogForm({ ...branchDialogForm, accountName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialogWebhookSecret">SePay webhook secret/API key</Label>
                <Input
                  id="dialogWebhookSecret"
                  type="password"
                  placeholder={branchDialogForm.sepaySecretSet ? "Đã có khóa — để trống nếu giữ nguyên" : "Dán secret dùng ở header webhook"}
                  value={branchDialogForm.webhookSecret}
                  onChange={(e) => setBranchDialogForm({ ...branchDialogForm, webhookSecret: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Thanh toán MoMo (tự động)</p>
                  <p className="text-xs text-muted-foreground">
                    Khách quét QR MoMo trên phiếu → MoMo báo về, đơn tự chốt và bàn tự dọn.
                  </p>
                </div>
                <Switch
                  checked={branchDialogForm.momoEnabled}
                  onCheckedChange={(v) => setBranchDialogForm({ ...branchDialogForm, momoEnabled: v })}
                />
              </div>

              {branchDialogForm.momoEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="dialogMomoEnv">Môi trường</Label>
                    <Select
                      value={branchDialogForm.momoEnv}
                      onValueChange={(v) =>
                        setBranchDialogForm({ ...branchDialogForm, momoEnv: v as "test" | "production" })
                      }
                    >
                      <SelectTrigger id="dialogMomoEnv">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Thử nghiệm (sandbox — không mất tiền thật)</SelectItem>
                        <SelectItem value="production">Thật (tiền thật)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="dialogMomoPartner">Partner Code</Label>
                      <Input
                        id="dialogMomoPartner"
                        placeholder="MOMO..."
                        value={branchDialogForm.momoPartnerCode}
                        onChange={(e) => setBranchDialogForm({ ...branchDialogForm, momoPartnerCode: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dialogMomoAccess">Access Key</Label>
                      <Input
                        id="dialogMomoAccess"
                        placeholder="Lấy ở business.momo.vn"
                        value={branchDialogForm.momoAccessKey}
                        onChange={(e) => setBranchDialogForm({ ...branchDialogForm, momoAccessKey: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialogMomoSecret">Secret Key</Label>
                    <Input
                      id="dialogMomoSecret"
                      type="password"
                      placeholder={
                        branchDialogForm.momoSecretKeySet
                          ? "Đã có khóa — để trống nếu giữ nguyên"
                          : "Dán Secret Key của MoMo"
                      }
                      value={branchDialogForm.momoSecretKey}
                      onChange={(e) => setBranchDialogForm({ ...branchDialogForm, momoSecretKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Vì bảo mật, khóa đã lưu không hiện lại ở đây. Để trống là giữ nguyên khóa cũ.
                    </p>
                  </div>
                  <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                    Nhớ khai <b>ipnUrl</b> bên MoMo trỏ về{" "}
                    <code className="break-all">
                      {(process.env.NEXT_PUBLIC_API_URL || "https://<tên-miền-API>").replace(/\/+$/, "")}
                      /api/payments/webhooks/momo
                    </code>
                    . Không khai thì MoMo không báo về và sẽ không có gì tự động.
                  </p>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>
              {t("settings.cancel")}
            </Button>
            <Button
              onClick={handleBranchDialogSave}
              disabled={!branchDialogForm.name || !branchDialogForm.slug || createBranch.isPending || updateBranchById.isPending}
            >
              {(createBranch.isPending || updateBranchById.isPending)
                ? t("settings.saving")
                : editingBranch
                ? t("settings.save")
                : t("settings.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
