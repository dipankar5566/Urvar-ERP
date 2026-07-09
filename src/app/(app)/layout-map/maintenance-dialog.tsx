"use client";

import { useState } from "react";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { logBedMaintenance } from "@/modules/layout/actions";
import {
  MAINTENANCE_TASK_TYPES,
  MAINTENANCE_TASK_LABELS,
  type MaintenanceTaskType,
} from "@/modules/layout/types";
import type { Item } from "@/modules/masters/types";

export function MaintenanceDialog({
  bedId,
  items,
  defaultItemId,
  trigger,
}: {
  bedId: number;
  items: Item[];
  defaultItemId: number | null;
  trigger: React.ReactNode;
}) {
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("watering");
  const [itemId, setItemId] = useState<number | null>(defaultItemId);
  const selectedItem = items.find((i) => i.id === itemId);

  return (
    <FormDialog title="Log Maintenance" action={logBedMaintenance} submitLabel="Log" trigger={trigger}>
      <input type="hidden" name="bedId" value={bedId} />
      <div className="space-y-2">
        <Label htmlFor="bm-task">Task</Label>
        <NativeSelect
          id="bm-task"
          name="taskType"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as MaintenanceTaskType)}
        >
          {MAINTENANCE_TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {MAINTENANCE_TASK_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {taskType === "bio_enzyme" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="bm-item">Item</Label>
            <NativeSelect
              id="bm-item"
              name="itemId"
              value={itemId ?? ""}
              onChange={(e) => setItemId(Number(e.target.value))}
              required
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bm-qty">Quantity applied {selectedItem ? `(${selectedItem.uom})` : ""}</Label>
            <Input id="bm-qty" name="qtyApplied" type="number" min={0} step="any" required />
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="bm-notes">Notes</Label>
        <Textarea id="bm-notes" name="notes" rows={2} />
      </div>
    </FormDialog>
  );
}
