"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import {
  Plus,
  Edit,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useModifierGroups,
  useDeleteModifierGroup,
  useUpdateModifier,
  useUpdateModifierGroup,
} from "@/hooks/use-menu";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useTranslation } from "@/stores/lang-store";
import { ModifierGroupDialog } from "./modifier-group-dialog";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

export function ModifierGroupsPanel() {
  const { data: groups, isLoading } = useModifierGroups();
  const deleteGroup = useDeleteModifierGroup();
  const updateModifier = useUpdateModifier();
  const updateGroup = useUpdateModifierGroup();
  const { t } = useTranslation();

  const [editGroup, setEditGroup] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingModifierId, setMovingModifierId] = useState<string | null>(null);
  const [movingGroupId, setMovingGroupId] = useState<string | null>(null);

  const groupList: any[] = [...(groups ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  );

  const handleMoveGroup = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= groupList.length) return;
    const next = [...groupList];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setMovingGroupId(next[targetIdx].id);
    try {
      await Promise.all(
        next.map((g, order) =>
          (g.sort_order ?? 0) === order
            ? Promise.resolve()
            : updateGroup.mutateAsync({ id: g.id, sortOrder: order })
        )
      );
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    } finally {
      setMovingGroupId(null);
    }
  };

  const sortedModifiers = (modifiers: any[]) =>
    [...modifiers].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
    );

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteGroup.mutateAsync(confirmDelete.id);
      toast.success(t("menu.deleteSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("menu.deleteError"));
    }
    setConfirmDelete(null);
  };

  const handleMoveModifier = async (modifiers: any[], idx: number, dir: -1 | 1) => {
    const ordered = sortedModifiers(modifiers);
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= ordered.length) return;

    const next = [...ordered];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setMovingModifierId(next[targetIdx].id);

    try {
      await Promise.all(
        next.map((mod, order) =>
          (mod.sort_order ?? 0) === order
            ? Promise.resolve()
            : updateModifier.mutateAsync({ id: mod.id, sortOrder: order })
        )
      );
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    } finally {
      setMovingModifierId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groupList.length} {t("menu.modifierGroups")}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("menu.addModifierGroup")}
        </Button>
      </div>

      {groupList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Settings2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            {t("menu.noGroups")}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {t("menu.createGroupDesc", "Create modifier group with options. E.g. Size, Sauce")}
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("menu.addModifierGroup")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {groupList.map((group: any, gidx: number) => {
            const isExpanded = expandedId === group.id;
            const modifiers: any[] = sortedModifiers(group.modifiers ?? []);
            return (
              <div
                key={group.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : group.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{group.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {modifiers.length} {t("menu.modifiers")}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Min: {group.min_selections} / Max:{" "}
                          {group.max_selections}
                        </span>
                        {group.is_required && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0"
                          >
                            {t("menu.required")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Đổi thứ tự nhóm */}
                    <div className="flex flex-col mr-1">
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(gidx, -1)}
                        disabled={gidx === 0 || movingGroupId === group.id}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Đưa nhóm lên"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveGroup(gidx, 1)}
                        disabled={gidx === groupList.length - 1 || movingGroupId === group.id}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Đưa nhóm xuống"
                      >
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditGroup(group)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setConfirmDelete(group)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* Expanded modifiers */}
                {isExpanded && modifiers.length > 0 && (
                  <div className="border-t border-border bg-muted/20 px-4 py-2">
                    <div className="space-y-1">
                      {modifiers.map((mod: any, idx: number) => (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleMoveModifier(modifiers, idx, -1)}
                                disabled={idx === 0 || movingModifierId === mod.id}
                                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                title="Đưa lên"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveModifier(modifiers, idx, 1)}
                                disabled={idx === modifiers.length - 1 || movingModifierId === mod.id}
                                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                title="Đưa xuống"
                              >
                                <ChevronDownIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span>{mod.name}</span>
                            {idx === 0 && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                Mặc định
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground">
                            {mod.price > 0
                              ? `+${formatCurrency(mod.price)}`
                              : t("menu.free", "Free")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isExpanded && modifiers.length === 0 && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground text-center">
                      {t("menu.noGroups", "No groups found")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {createOpen && (
        <ModifierGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
      {editGroup && (
        <ModifierGroupDialog
          open={!!editGroup}
          onOpenChange={(v) => {
            if (!v) setEditGroup(null);
          }}
          initial={editGroup}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(v) => {
            if (!v) setConfirmDelete(null);
          }}
          title={t("menu.confirmDeleteTitle")}
          description={t("menu.confirmDeleteDesc")}
          onConfirm={handleDelete}
          loading={deleteGroup.isPending}
        />
      )}
    </div>
  );
}
