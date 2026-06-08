"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Mail, Eye, EyeOff, Pencil, UserX, UserCheck, KeyRound } from "lucide-react";
import { SearchInput } from "@/components/search-input";
import { useTranslation } from "@/stores/lang-store";

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  org_admin: "default",
  branch_manager: "default",
  cashier: "secondary",
  waiter: "secondary",
  kitchen: "outline",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface StaffGridProps {
  staff: any[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  showInactive: boolean;
  onToggleInactive: () => void;
  onEdit: (member: any) => void;
  onPassword: (member: any) => void;
  onToggleActive: (member: any) => void;
  updatePending: boolean;
}

export function StaffGrid({
  staff,
  isLoading,
  search,
  onSearchChange,
  showInactive,
  onToggleInactive,
  onEdit,
  onPassword,
  onToggleActive,
  updatePending,
}: StaffGridProps) {
  const { t } = useTranslation();

  const roleLabels: Record<string, string> = {
    org_admin: t("staff.role_org_admin"),
    branch_manager: t("staff.role_branch_manager"),
    cashier: t("staff.role_cashier"),
    waiter: t("staff.role_waiter"),
    kitchen: t("staff.role_kitchen"),
  };

  const filteredStaff = staff.filter(
    (member: any) =>
      member.name.toLowerCase().includes(search.toLowerCase()) ||
      (member.email || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      {/* Search + inactive filter */}
      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t("staff.searchPlaceholder")}
          className="flex-1"
        />
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="icon"
          onClick={onToggleInactive}
          title={showInactive ? t("staff.hideInactive") : t("staff.showInactive")}
        >
          {showInactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-24 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredStaff.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {search ? t("staff.noMembersFound") : t("staff.noMembers")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStaff.map((member: any) => {
            const branches: any[] = member.branches || [];
            const isInactive = !member.isActive;
            return (
              <Card key={member.id} className={isInactive ? "opacity-60" : undefined}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isInactive ? "bg-muted" : "bg-primary/10"}`}>
                        <span className={`text-sm font-bold ${isInactive ? "text-muted-foreground" : "text-primary"}`}>
                          {member.name
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{member.name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={roleBadgeVariant[member.role] || "outline"}>
                        {roleLabels[member.role] || member.role}
                      </Badge>
                      {isInactive && (
                        <Badge variant="destructive" className="text-[10px]">
                          {t("staff.inactive")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-wrap">
                      {branches.length > 0 ? (
                        branches.map((b: any) => (
                          <Badge key={b.id} variant="outline" className="text-xs">
                            {b.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("staff.noBranches")}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEdit(member)}
                        title={t("common.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onPassword(member)}
                        title={t("staff.changePassword")}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onToggleActive(member)}
                        disabled={updatePending}
                        title={member.isActive ? t("staff.deactivate") : t("staff.activate")}
                      >
                        {member.isActive ? (
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
