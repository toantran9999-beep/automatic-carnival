"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Label } from "@restai/ui/components/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { UserMinus } from "lucide-react";
import { useTableAssignments, useAssignWaiter, useRemoveAssignment } from "@/hooks/use-tables";
import { useStaffList } from "@/hooks/use-staff";
import { useTranslation } from "@/stores/lang-store";

interface AssignmentDialogProps {
  table: any | null;
  onClose: () => void;
}

export function AssignmentDialog({ table, onClose }: AssignmentDialogProps) {
  const { t, lang } = useTranslation();
  const [assignKey, setAssignKey] = useState(0);
  const { data: assignmentsData } = useTableAssignments(table?.id);
  const assignWaiter = useAssignWaiter();
  const removeAssignment = useRemoveAssignment();
  const { data: staffData } = useStaffList();

  const waiters: any[] = (staffData ?? []).filter((s: any) => ["waiter", "branch_manager", "org_admin"].includes(s.role));
  const assignments: any[] = assignmentsData ?? [];

  return (
    <Dialog open={!!table} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("tables.assign")} {t("nav.role_waiter").toLowerCase()} - {t("tables.title")} {table?.number}
          </DialogTitle>
          <DialogDescription>
            {lang === "vi"
              ? "Quản lý nhân viên phục vụ phân công cho bàn này"
              : "Manage waiters assigned to this table"}
          </DialogDescription>
        </DialogHeader>
        {table && (
          <div className="space-y-4">
            {/* Current assignments */}
            <div>
              <Label className="text-sm mb-2 block">{t("tables.assignedWaiters")}</Label>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("tables.noWaiters")}</p>
              ) : (
                <div className="space-y-2">
                  {assignments.map((a: any) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {a.user_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{a.user_name}</p>
                          <p className="text-xs text-muted-foreground">{a.user_role}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={removeAssignment.isPending}
                        onClick={() => removeAssignment.mutate({ tableId: table.id, userId: a.user_id })}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add waiter */}
            <div>
              <Label className="text-sm mb-2 block">{t("tables.addWaiter")}</Label>
              <Select
                key={assignKey}
                onValueChange={(userId) => {
                  assignWaiter.mutate(
                    { tableId: table.id, userId },
                    { onSuccess: () => setAssignKey((k) => k + 1) }
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("tables.selectWaiter")} />
                </SelectTrigger>
                <SelectContent>
                  {waiters
                    .filter((w: any) => !assignments.some((a: any) => a.user_id === w.id))
                    .map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
