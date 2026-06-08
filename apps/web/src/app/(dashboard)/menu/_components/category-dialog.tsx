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
  DialogFooter,
} from "@restai/ui/components/dialog";
import {
  useCreateCategory,
  useUpdateCategory,
} from "@/hooks/use-menu";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { ImageUploadButton } from "./image-upload-button";

export function CategoryDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: any;
}) {
  const isEdit = !!initial;
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const { t } = useTranslation();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string>(initial?.image_url ?? "");

  const loading = createCat.isPending || updateCat.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (isEdit) {
        await updateCat.mutateAsync({
          id: initial.id,
          name: name.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
        });
        toast.success(t("menu.saveSuccess"));
      } else {
        await createCat.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
        });
        toast.success(t("menu.saveSuccess"));
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || t("menu.saveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("menu.editCategory") : t("menu.addCategory")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">{t("menu.name")}</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">{t("menu.description")}</Label>
            <Input
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="..."
            />
          </div>
          <div className="space-y-2">
            <Label>{t("menu.image")}</Label>
            <ImageUploadButton
              currentUrl={imageUrl || null}
              onUploaded={(url) => setImageUrl(url)}
              uploadType="category"
            />
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
              {loading ? t("menu.saving") : isEdit ? t("common.save") : t("settings.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
