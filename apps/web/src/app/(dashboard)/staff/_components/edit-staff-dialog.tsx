"use client";

import { useState, useEffect } from "react";
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
import { useUpdateStaff } from "@/hooks/use-staff";
import { useBranches } from "@/hooks/use-settings";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useTranslation } from "@/stores/lang-store";

interface EditStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: any | null;
}

export function EditStaffDialog({ open, onOpenChange, member }: EditStaffDialogProps) {
  const [editForm, setEditForm] = useState({ name: "", role: "waiter", branchIds: [] as string[] });
  const updateStaff = useUpdateStaff();
  const { data: branchesData } = useBranches();
  const branches = branchesData ?? [];
  const { t } = useTranslation();

  useEffect(() => {
    if (member) {
      setEditForm({
        name: member.name,
        role: member.role,
        branchIds: member.branches?.map((b: any) => b.id) ?? [],
      });
    }
  }, [member]);

  const handleEdit = async () => {
    if (!member || !editForm.name) {
      toast.error(t("staff.requiredFields"));
      return;
    }
    try {
      await updateStaff.mutateAsync({
        id: member.id,
        name: editForm.name,
        role: editForm.role,
        branchIds: editForm.branchIds,
      });
      toast.success(t("menu.saveSuccess"));
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || t("staff.statusError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staff.editStaff")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("staff.name")}</Label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder={t("staff.name")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("staff.role")}</Label>
            <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
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
                const isChecked = editForm.branchIds.includes(branch.id);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() =>
                      setEditForm({
                        ...editForm,
                        branchIds: isChecked
                          ? editForm.branchIds.filter((id) => id !== branch.id)
                          : [...editForm.branchIds, branch.id],
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
            {editForm.branchIds.length === 0 && (
              <p className="text-xs text-destructive">{t("staff.selectBranchError")}</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleEdit}
            disabled={updateStaff.isPending || editForm.branchIds.length === 0}
          >
            {updateStaff.isPending ? t("staff.saving") : t("staff.saveChanges")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
