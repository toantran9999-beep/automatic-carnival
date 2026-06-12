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
import { Plus, Pencil, Store } from "lucide-react";
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
    });
    setSlugManuallyEdited(false);
    setBranchDialogOpen(true);
  };

  const openEditBranchDialog = (branch: any) => {
    const sepay = branch.settings?.payment?.sepay || branch.settings?.sepay || {};
    setEditingBranch(branch);
    setBranchDialogForm({
      name: branch.name || "",
      slug: branch.slug || "",
      address: branch.address || "",
      phone: branch.phone || "",
      bankCode: sepay.bank_code || sepay.bankCode || "",
      accountNumber: sepay.account_number || sepay.accountNumber || "",
      accountName: sepay.account_name || sepay.accountName || "",
      webhookSecret: sepay.webhook_secret || sepay.webhookSecret || sepay.api_key || sepay.apiKey || "",
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
          bank_code: branchDialogForm.bankCode.trim(),
          account_number: branchDialogForm.accountNumber.trim(),
          account_name: branchDialogForm.accountName.trim(),
          webhook_secret: branchDialogForm.webhookSecret.trim(),
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
                  <Label htmlFor="dialogBankCode">Mã ngân hàng VietQR</Label>
                  <Input
                    id="dialogBankCode"
                    placeholder="VD: MBBank, VCB, ACB"
                    value={branchDialogForm.bankCode}
                    onChange={(e) => setBranchDialogForm({ ...branchDialogForm, bankCode: e.target.value })}
                  />
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
                  placeholder="Dán secret dùng ở header webhook"
                  value={branchDialogForm.webhookSecret}
                  onChange={(e) => setBranchDialogForm({ ...branchDialogForm, webhookSecret: e.target.value })}
                />
              </div>
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
