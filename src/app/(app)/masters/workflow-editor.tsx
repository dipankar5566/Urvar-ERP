"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form-dialog";
import { saveWorkflowTemplate } from "@/modules/masters/actions";
import type { WorkflowTemplate, WorkflowTemplateStage, Product } from "@/modules/masters/types";

type StageDraft = { name: string; expectedDays?: number; requiresReadings: boolean };

export function WorkflowEditor({
  templates,
  templateStages,
  products,
}: {
  templates: WorkflowTemplate[];
  templateStages: WorkflowTemplateStage[];
  products: Product[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <WorkflowDialog products={products} trigger={
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add Workflow
          </Button>
        } />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Stages</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => {
              const stages = templateStages.filter((s) => s.templateId === t.id);
              const product = products.find((p) => p.id === t.productId);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{product?.name ?? "Any"}</TableCell>
                  <TableCell className="max-w-lg text-sm text-muted-foreground">
                    {stages.length} stages: {stages.map((s) => s.name).join(" → ")}
                  </TableCell>
                  <TableCell>
                    <WorkflowDialog
                      template={t}
                      existingStages={stages}
                      products={products}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WorkflowDialog({
  template,
  existingStages,
  products,
  trigger,
}: {
  template?: WorkflowTemplate;
  existingStages?: WorkflowTemplateStage[];
  products: Product[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(template?.name ?? "");
  const [productId, setProductId] = useState<number | undefined>(template?.productId ?? undefined);
  const [stages, setStages] = useState<StageDraft[]>(
    existingStages?.map((s) => ({
      name: s.name,
      expectedDays: s.expectedDays ?? undefined,
      requiresReadings: s.requiresReadings,
    })) ?? [{ name: "", requiresReadings: false }]
  );

  function move(idx: number, dir: -1 | 1) {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStages(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await saveWorkflowTemplate({
        id: template?.id,
        name,
        productId,
        stages: stages.filter((s) => s.name.trim()),
      });
      if (result.ok) {
        toast.success("Workflow saved");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{trigger}</span>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Workflow" : "Add Workflow"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Default for product</Label>
              <NativeSelect
                value={productId ?? ""}
                onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Any product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Stages (in order)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStages([...stages, { name: "", requiresReadings: false }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Stage
              </Button>
            </div>
            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-6 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                  <Input
                    className="flex-1"
                    placeholder="Stage name"
                    value={stage.name}
                    onChange={(e) => {
                      const next = [...stages];
                      next[idx] = { ...stage, name: e.target.value };
                      setStages(next);
                    }}
                  />
                  <Input
                    className="w-16"
                    type="number"
                    min={0}
                    placeholder="days"
                    title="Expected days"
                    value={stage.expectedDays ?? ""}
                    onChange={(e) => {
                      const next = [...stages];
                      next[idx] = {
                        ...stage,
                        expectedDays: e.target.value ? Number(e.target.value) : undefined,
                      };
                      setStages(next);
                    }}
                  />
                  <input
                    type="checkbox"
                    title="Requires readings (temperature/moisture)"
                    checked={stage.requiresReadings}
                    onChange={(e) => {
                      const next = [...stages];
                      next[idx] = { ...stage, requiresReadings: e.target.checked };
                      setStages(next);
                    }}
                    className="h-4 w-4"
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => move(idx, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => move(idx, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove"
                    disabled={stages.length === 1}
                    onClick={() => setStages(stages.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Checkbox = stage requires readings (temperature, moisture, pH).
            </p>
          </div>

          <DialogFooter>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
