"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Badge } from "@restai/ui/components/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Link2, Unlink } from "lucide-react";
import {
  useCreateMenuItem,
  useUpdateMenuItem,
  useItemModifierGroups,
  useLinkModifierGroup,
  useUnlinkModifierGroup,
} from "@/hooks/use-menu";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { ImageUploadButton } from "./image-upload-button";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

export function ProductDialog({
  open,
  onOpenChange,
  categories,
  allModifierGroups,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: any[];
  allModifierGroups: any[];
  initial?: any;
}) {
  const isEdit = !!initial;
  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const linkGroup = useLinkModifierGroup();
  const unlinkGroup = useUnlinkModifierGroup();
  const { t } = useTranslation();

  const { data: linkedGroups, isLoading: linkedLoading } =
    useItemModifierGroups(initial?.id ?? "");

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceSoles, setPriceSoles] = useState(
    initial ? (initial.price % 100 === 0 ? (initial.price / 100).toString() : (initial.price / 100).toFixed(2)) : ""
  );
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ?? initial?.categoryId ?? categories[0]?.id ?? ""
  );
  const [unit, setUnit] = useState<string>(initial?.unit ?? "");
  const [prepTime, setPrepTime] = useState<string>(
    initial?.preparation_time_min?.toString() ?? ""
  );
  const [imageUrl, setImageUrl] = useState<string>(
    initial?.image_url ?? initial?.imageUrl ?? ""
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [linkKey, setLinkKey] = useState(0);

  const loading = createItem.isPending || updateItem.isPending;
  const linkedGroupIds = (linkedGroups ?? []).map((g: any) => g.id);
  const unlinkedGroups = allModifierGroups.filter(
    (g: any) => !linkedGroupIds.includes(g.id)
  );
  const selectedCategoryName =
    categories.find((c: any) => c.id === categoryId)?.name ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !priceSoles) return;

    const priceInCents = Math.round(parseFloat(priceSoles) * 100);
    if (isNaN(priceInCents) || priceInCents < 0) {
      toast.error(t("menu.saveError"));
      return;
    }

    if (!categoryId) {
      toast.error(t("menu.selectCategoryError", "Select a category"));
      return;
    }

    const payload: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: priceInCents,
      categoryId,
      imageUrl: imageUrl || undefined,
      preparationTimeMin: prepTime ? parseInt(prepTime, 10) : undefined,
      unit: unit.trim() || undefined,
    };

    try {
      if (isEdit) {
        await updateItem.mutateAsync({ id: initial.id, ...payload });
        toast.success(t("menu.saveSuccess"));
      } else {
        await createItem.mutateAsync(payload);
        toast.success(t("menu.saveSuccess"));
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    }
  };

  const handleLink = async (groupId: string) => {
    if (!initial?.id) return;
    try {
      await linkGroup.mutateAsync({ itemId: initial.id, groupId });
      toast.success(t("menu.saveSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    }
  };

  const handleUnlink = async (groupId: string) => {
    if (!initial?.id) return;
    try {
      await unlinkGroup.mutateAsync({ itemId: initial.id, groupId });
      toast.success(t("menu.saveSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("menu.editProduct") : t("menu.addProduct")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="prod-name">{t("menu.name")}</Label>
              <Input
                id="prod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="..."
                required
              />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="prod-cat">{t("menu.category")}</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger disabled={categories.length === 0}>
                  <SelectValue placeholder={categories.length === 0 ? t("menu.createCategoryFirst", "Create a category first") : t("menu.selectCategory", "Select category")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-desc">{t("menu.description")}</Label>
            <Input
              id="prod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-price">{t("menu.price")}</Label>
              <Input
                id="prod-price"
                type="number"
                step="any"
                min="0"
                value={priceSoles}
                onChange={(e) => setPriceSoles(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-prep">{t("kitchen.preparingTime")} (min)</Label>
              <Input
                id="prod-prep"
                type="number"
                min="0"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-unit">{t("menu.unit")}</Label>
            <Input
              id="prod-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={t("menu.unitPlaceholder")}
              maxLength={20}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("menu.image")}</Label>
            <ImageUploadButton
              currentUrl={imageUrl || null}
              onUploaded={(url) => setImageUrl(url)}
              productName={name}
              description={description}
              categoryName={selectedCategoryName}
              onGeneratedPrompt={setAiPrompt}
            />
            {aiPrompt && (
              <p className="rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Prompt AI: {aiPrompt}
              </p>
            )}
          </div>

          {/* Modifier Groups section — only visible when editing */}
          {isEdit && (
            <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t("menu.modifierGroups")}
                </Label>
                <Badge variant="secondary" className="text-[10px]">
                  {linkedGroupIds.length} {t("common.actions") !== "Actions" ? "đã liên kết" : "linked"}
                </Badge>
              </div>

              {/* Linked groups */}
              {linkedLoading ? (
                <Skeleton className="h-10" />
              ) : linkedGroupIds.length > 0 ? (
                <div className="space-y-2">
                  {(linkedGroups ?? []).map((g: any) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium">{g.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({g.modifiers?.length ?? 0} {t("menu.modifiers")})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlink(g.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        disabled={unlinkGroup.isPending}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t("menu.noGroups", "No groups found")}
                </p>
              )}

              {/* Add group dropdown */}
              {unlinkedGroups.length > 0 && (
                <Select key={linkKey} onValueChange={(v) => { handleLink(v); setLinkKey((k) => k + 1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("menu.linkGroup", "+ Link group...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedGroups.map((g: any) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.modifiers?.length ?? 0} {t("menu.modifiers")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

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
              {loading ? t("menu.saving") : isEdit ? t("common.save") : t("settings.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
