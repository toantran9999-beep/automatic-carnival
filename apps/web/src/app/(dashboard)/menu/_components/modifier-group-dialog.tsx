"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Plus, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useAddModifier,
  useUpdateModifier,
  useDeleteModifier,
} from "@/hooks/use-menu";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

export function ModifierGroupDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: any;
}) {
  const isEdit = !!initial;
  const createGroup = useCreateModifierGroup();
  const updateGroup = useUpdateModifierGroup();
  const addModifier = useAddModifier();
  const updateModifier = useUpdateModifier();
  const deleteModifier = useDeleteModifier();
  const { t } = useTranslation();

  const [groupName, setGroupName] = useState(initial?.name ?? "");
  const [minSel, setMinSel] = useState(
    initial?.min_selections?.toString() ?? "0"
  );
  const [maxSel, setMaxSel] = useState(
    initial?.max_selections?.toString() ?? "1"
  );
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);

  // For new groups: inline modifiers to create
  const [newModifiers, setNewModifiers] = useState<
    { name: string; price: string }[]
  >(isEdit ? [] : [{ name: "", price: "0" }]);

  // For editing: track existing modifiers (sorted, reorderable)
  const [existing, setExisting] = useState<any[]>(
    [...(initial?.modifiers ?? [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )
  );

  const persistOrder = async (list: any[]) => {
    await Promise.all(
      list.map((m, i) =>
        m.sort_order === i ? Promise.resolve() : updateModifier.mutateAsync({ id: m.id, sortOrder: i })
      )
    );
  };

  const moveExisting = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= existing.length) return;
    const next = [...existing];
    [next[idx], next[j]] = [next[j], next[idx]];
    setExisting(next.map((m, i) => ({ ...m, sort_order: i })));
    void persistOrder(next);
  };

  const loading =
    createGroup.isPending ||
    updateGroup.isPending ||
    addModifier.isPending;

  const handleAddRow = () => {
    setNewModifiers((prev) => [...prev, { name: "", price: "0" }]);
  };

  const handleRemoveRow = (idx: number) => {
    setNewModifiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleModChange = (
    idx: number,
    field: "name" | "price",
    value: string
  ) => {
    setNewModifiers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  };

  const handleDeleteExistingModifier = async (modId: string) => {
    try {
      await deleteModifier.mutateAsync(modId);
      setExisting((prev) => prev.filter((m) => m.id !== modId));
      toast.success(t("menu.deleteSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      if (isEdit) {
        // Update group metadata
        await updateGroup.mutateAsync({
          id: initial.id,
          name: groupName.trim(),
          minSelections: parseInt(minSel, 10) || 0,
          maxSelections: parseInt(maxSel, 10) || 1,
          isRequired,
        });

        // Add any new modifiers (xếp sau các tùy chọn hiện có)
        const validNew = newModifiers.filter((m) => m.name.trim());
        for (let i = 0; i < validNew.length; i++) {
          const mod = validNew[i];
          await addModifier.mutateAsync({
            groupId: initial.id,
            name: mod.name.trim(),
            price: Math.round(parseFloat(mod.price || "0") * 100),
            isAvailable: true,
            sortOrder: existing.length + i,
          });
        }

        toast.success(t("menu.saveSuccess"));
      } else {
        const validMods = newModifiers.filter((m) => m.name.trim());
        if (validMods.length === 0) {
          toast.error(t("menu.addModifierError", "Add at least one modifier option"));
          return;
        }

        const group = await createGroup.mutateAsync({
          name: groupName.trim(),
          minSelections: parseInt(minSel, 10) || 0,
          maxSelections: parseInt(maxSel, 10) || 1,
          isRequired,
        });

        for (let i = 0; i < validMods.length; i++) {
          const mod = validMods[i];
          await addModifier.mutateAsync({
            groupId: group.id,
            name: mod.name.trim(),
            price: Math.round(parseFloat(mod.price || "0") * 100),
            isAvailable: true,
            sortOrder: i,
          });
        }

        toast.success(t("menu.saveSuccess"));
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("menu.editModifierGroup") : t("menu.addModifierGroup")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("menu.editGroupDesc", "Update group and manage options")
              : t("menu.createGroupDesc", "Create modifier group with options. E.g. Size, Sauce")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grp-name">{t("menu.name")}</Label>
            <Input
              id="grp-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="..."
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="grp-min">{t("menu.minSelect")}</Label>
              <Input
                id="grp-min"
                type="number"
                min="0"
                value={minSel}
                onChange={(e) => setMinSel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grp-max">{t("menu.maxSelect")}</Label>
              <Input
                id="grp-max"
                type="number"
                min="1"
                value={maxSel}
                onChange={(e) => setMaxSel(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded border-input accent-primary"
                />
                {t("menu.required")}
              </label>
            </div>
          </div>

          {/* Existing modifiers (edit mode) — kéo thứ tự bằng ↑/↓ */}
          {isEdit && existing.length > 0 && (
            <div className="space-y-2">
              <Label>{t("menu.modifiers")} ({t("common.actions") !== "Actions" ? "hiện có — dùng ↑↓ để sắp thứ tự" : "existing — use ↑↓ to reorder"})</Label>
              <div className="space-y-1.5">
                {existing.map((mod: any, idx: number) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-2"
                  >
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => moveExisting(idx, -1)}
                          disabled={idx === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                          title="Lên"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveExisting(idx, 1)}
                          disabled={idx === existing.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none"
                          title="Xuống"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm ml-1">{mod.name}</span>
                      {idx === 0 && (
                        <span className="text-[10px] text-primary font-medium ml-1">(mặc định)</span>
                      )}
                      {mod.price !== 0 && (
                        <span className={`text-xs font-medium ml-1 ${mod.price > 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {mod.price > 0 ? "+" : "−"}{formatCurrency(Math.abs(mod.price))}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteExistingModifier(mod.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      disabled={deleteModifier.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New modifiers */}
          <div className="space-y-2">
            <Label>
              {isEdit ? t("menu.addModifier") : t("menu.modifiers")}
            </Label>
            <div className="space-y-2">
              {newModifiers.map((mod, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={mod.name}
                    onChange={(e) =>
                      handleModChange(idx, "name", e.target.value)
                    }
                    placeholder={t("menu.name")}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={mod.price}
                    onChange={(e) =>
                      handleModChange(idx, "price", e.target.value)
                    }
                    placeholder="+/- giá"
                    title="Để 0 nếu không đổi giá. Số âm = giảm giá."
                    className="w-24"
                  />
                  {newModifiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("menu.addModifier")}
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? t("menu.saving")
                : isEdit
                  ? t("common.save")
                  : t("settings.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
