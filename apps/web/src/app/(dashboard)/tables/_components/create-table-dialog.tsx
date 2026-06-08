"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateTable } from "@/hooks/use-tables";
import { useTranslation } from "@/stores/lang-store";

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: any[];
}

export function CreateTableDialog({ open, onOpenChange, spaces }: CreateTableDialogProps) {
  const { t } = useTranslation();
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");
  const [newTableSpaceId, setNewTableSpaceId] = useState("none");
  const createTable = useCreateTable();

  const handleCreateTable = () => {
    const num = parseInt(newTableNumber);
    const cap = parseInt(newTableCapacity);
    if (!num || num < 1) return;
    createTable.mutate(
      {
        number: num,
        capacity: cap || 4,
        spaceId: newTableSpaceId === "none" ? undefined : newTableSpaceId,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setNewTableNumber("");
          setNewTableCapacity("4");
          setNewTableSpaceId("none");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tables.addTable")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="table-number">{t("tables.tableName")}</Label>
            <Input
              id="table-number"
              type="number"
              min={1}
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-capacity">{t("tables.tableCapacity")}</Label>
            <Input
              id="table-capacity"
              type="number"
              min={1}
              max={50}
              value={newTableCapacity}
              onChange={(e) => setNewTableCapacity(e.target.value)}
              placeholder="4"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tables.spaces")} ({t("menu.optional").toLowerCase()})</Label>
            <Select value={newTableSpaceId} onValueChange={setNewTableSpaceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("tables.unassigned")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tables.unassigned")}</SelectItem>
                {spaces.map((space: any) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreateTable}
            disabled={createTable.isPending || !newTableNumber}
          >
            {createTable.isPending ? t("staff.creating") : t("tables.addTable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
