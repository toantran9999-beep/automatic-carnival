"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { DatePicker } from "@restai/ui/components/date-picker";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateCustomer } from "@/hooks/use-loyalty";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

export function CreateCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useTranslation();
  const createCustomer = useCreateCustomer();
  const [form, setForm] = useState({ name: "", phone: "", email: "", birthDate: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createCustomer.mutate(
      {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        birthDate: form.birthDate || undefined,
      },
      {
        onSuccess: () => {
          setForm({ name: "", phone: "", email: "", birthDate: "" });
          onOpenChange(false);
          toast.success(lang === "vi" ? "Đăng ký thành viên thành công" : "Member registered successfully");
        },
        onError: (err) => toast.error(`${t("common.error")}: ${(err as Error).message}`),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("loyalty.addCustomer")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">{t("common.name")} *</Label>
            <Input id="cust-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">{t("loyalty.phone")}</Label>
            <Input id="cust-phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-email">{t("loyalty.email")}</Label>
            <Input id="cust-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-birth">{lang === "vi" ? "Ngày sinh" : "Date of Birth"}</Label>
            <DatePicker id="cust-birth" value={form.birthDate} onChange={(d) => setForm((p) => ({ ...p, birthDate: d ?? "" }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createCustomer.isPending || !form.name}>
              {createCustomer.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
