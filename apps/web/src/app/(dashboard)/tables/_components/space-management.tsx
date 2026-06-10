"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Edit2, Trash2 } from "lucide-react";
import { useCreateSpace, useUpdateSpace } from "@/hooks/use-tables";
import { useTranslation } from "@/stores/lang-store";

// --- Space Info Card ---

interface SpaceInfoCardProps {
  space: any;
  tableCount: number;
  canManage?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function SpaceInfoCard({ space, tableCount, canManage, onEdit, onDelete }: SpaceInfoCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="mt-4">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{space.name}</h3>
          {space.description && (
            <p className="text-sm text-muted-foreground">{space.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {space.floor_number ? `${t("tables.floor")} ${space.floor_number} – ` : ""}
            {tableCount} {t("tables.tablesCount")}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Create Space Dialog ---

interface CreateSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSpaceDialog({ open, onOpenChange }: CreateSpaceDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floor, setFloor] = useState("");
  const createSpace = useCreateSpace();

  const handleCreate = () => {
    if (!name.trim()) return;
    createSpace.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        floorNumber: floor.trim() ? Math.max(0, parseInt(floor) || 0) : 0,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName("");
          setDescription("");
          setFloor("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tables.addSpace")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="space-name">{t("tables.spaceName")}</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VIP, Lounge..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="space-description">{t("menu.description")} ({t("menu.optional").toLowerCase()})</Label>
            <Input
              id="space-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outdoor area..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="space-floor">{t("tables.floor")} ({t("menu.optional").toLowerCase()})</Label>
            <Input
              id="space-floor"
              type="number"
              min={0}
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder={t("tables.floorOptionalHint")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createSpace.isPending || !name.trim()}
          >
            {createSpace.isPending ? t("staff.creating") : t("tables.addSpace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Edit Space Dialog ---

interface EditSpaceDialogProps {
  space: any | null;
  onClose: () => void;
}

export function EditSpaceDialog({ space, onClose }: EditSpaceDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floor, setFloor] = useState("");
  const updateSpace = useUpdateSpace();

  // Sync form state when space changes
  const [prevSpaceId, setPrevSpaceId] = useState<string | null>(null);
  if (space && space.id !== prevSpaceId) {
    setPrevSpaceId(space.id);
    setName(space.name);
    setDescription(space.description || "");
    setFloor(space.floor_number ? String(space.floor_number) : "");
  }
  if (!space && prevSpaceId) {
    setPrevSpaceId(null);
  }

  const handleUpdate = () => {
    if (!space || !name.trim()) return;
    updateSpace.mutate(
      {
        id: space.id,
        name: name.trim(),
        description: description.trim() || undefined,
        floorNumber: floor.trim() ? Math.max(0, parseInt(floor) || 0) : 0,
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return (
    <Dialog open={!!space} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tables.editSpace")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-space-name">{t("common.name")}</Label>
            <Input
              id="edit-space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-space-desc">{t("menu.description")}</Label>
            <Input
              id="edit-space-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-space-floor">{t("tables.floor")} ({t("menu.optional").toLowerCase()})</Label>
            <Input
              id="edit-space-floor"
              type="number"
              min={0}
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder={t("tables.floorOptionalHint")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updateSpace.isPending || !name.trim()}
          >
            {updateSpace.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
