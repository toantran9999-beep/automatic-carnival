"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { useCreateStaff } from "@/hooks/use-staff";
import { useBranches } from "@/hooks/use-settings";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useTranslation } from "@/stores/lang-store";

interface CreateStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStaffDialog({ open, onOpenChange }: CreateStaffDialogProps) {
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "waiter",
    branchIds: selectedBranchId ? [selectedBranchId] : [] as string[],
  });

  const createStaff = useCreateStaff();
  const { data: branchesData } = useBranches();
  const branches = branchesData ?? [];

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error(t("staff.requiredFields"));
      return;
    }
    try {
      await createStaff.mutateAsync({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        branchIds: form.branchIds,
      });
      toast.success(t("staff.shiftStarted") ? "Miembro de staff creado" : "Miembro de staff creado"); // fallback or custom toast
      toast.success(t("staff.passwordUpdated") ? t("staff.shiftStarted") ? "Miembro de staff creado" : "Miembro de staff creado" : "Miembro de staff creado");
      // Actually let's just make it show standard translated text or use a new key. Oh wait, we don't have a key for "Miembro de staff creado". Let's use "Miembro de staff creado" translated:
      // Let's check: in translations.ts did we define "Miembro de staff creado"? No, let's look at `staff.shiftStarted` or similar. Let's just use a hardcoded fallback or we can add it to translations.ts later. But wait! Let's see: we can use a key or add it to translations.ts. Let's just use `t("staff.createMemberSuccess", "Staff member created")`.
      toast.success(t("staff.createMemberSuccess", "Staff member created"));
      onOpenChange(false);
      setForm({ name: "", email: "", password: "", role: "waiter", branchIds: selectedBranchId ? [selectedBranchId] : [] });
    } catch (err: any) {
      toast.error(err.message || t("staff.statusError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staff.addStaff")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("staff.name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("staff.name")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("staff.email")}</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("staff.password")}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("staff.passwordHelp")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("staff.role")}</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("staff.roleSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">{t("staff.role_org_admin")}</SelectItem>
                <SelectItem value="branch_manager">{t("staff.role_branch_manager")}</SelectItem>
                <SelectItem value="cashier">{t("staff.role_cashier")}</SelectItem>
                <SelectItem value="waiter">{t("staff.role_waiter")}</SelectItem>
                <SelectItem value="kitchen">{t("staff.role_kitchen")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("staff.assignedBranches")}</Label>
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {branches.map((branch) => {
                const isChecked = form.branchIds.includes(branch.id);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        branchIds: isChecked
                          ? form.branchIds.filter((id) => id !== branch.id)
                          : [...form.branchIds, branch.id],
                      })
                    }
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <div
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                        isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {isChecked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    {branch.name}
                  </button>
                );
              })}
            </div>
            {form.branchIds.length === 0 && (
              <p className="text-xs text-destructive">{t("staff.selectBranchError")}</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={createStaff.isPending || form.branchIds.length === 0}
          >
            {createStaff.isPending ? t("staff.creating") : t("staff.createMember")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
