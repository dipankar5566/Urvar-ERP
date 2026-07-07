"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Check,
  CircleDashed,
  Loader2,
  Thermometer,
  Ban,
  PackageCheck,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  startProductionOrder,
  completeStage,
  recordReading,
  completeProductionOrder,
  cancelProductionOrder,
} from "@/modules/production/actions";
import { assignBeds } from "@/modules/layout/actions";
import type { OrderDetail } from "@/modules/production/queries";
import { STATUS_BADGE } from "../production-view";
import { fmtDateTime } from "@/lib/dates";

type BedOption = {
  id: number;
  code: string;
  available: boolean;
  occupantOrderNo: string | null;
};

export function OrderDetailView({
  detail,
  bedOptions,
  assignedBedIds,
}: {
  detail: OrderDetail;
  bedOptions: BedOption[];
  assignedBedIds: number[];
}) {
  const { order, stages, readings, batch } = detail;
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[order.status];
  const activeStage = stages.find((s) => s.status === "in_progress");
  const assignedCodes = bedOptions.filter((b) => assignedBedIds.includes(b.id)).map((b) => b.code);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(successMsg);
      else toast.error(result.error ?? "Failed");
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/production"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Production orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{order.orderNo}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.productName} — {order.targetQty} {order.uom} · {order.formulaName} ·{" "}
            {order.warehouseName} · Supervisor: {order.supervisorName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Beds:</span>
            {assignedCodes.length > 0 ? (
              assignedCodes.map((c) => (
                <Badge key={c} variant="secondary" className="font-mono text-xs">
                  {c}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">none assigned</span>
            )}
            {(order.status === "draft" || order.status === "in_progress") && (
              <BedAssignDialog
                orderId={order.id}
                bedOptions={bedOptions}
                assignedBedIds={assignedBedIds}
              />
            )}
          </div>
          {order.remarks && <p className="mt-1 text-sm text-muted-foreground">{order.remarks}</p>}
        </div>

        <div className="flex gap-2">
          {order.status === "draft" && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => startProductionOrder(order.id), "Order started — materials issued")
                }
              >
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                Start Production
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => cancelProductionOrder(order.id), "Order cancelled")}
              >
                <Ban className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </>
          )}
          {order.status === "in_progress" && (
            <FormDialog
              title="Complete Production"
              action={completeProductionOrder}
              submitLabel="Complete & Create Batch"
              trigger={
                <Button size="sm">
                  <PackageCheck className="mr-1 h-4 w-4" /> Complete Order
                </Button>
              }
            >
              <input type="hidden" name="orderId" value={order.id} />
              <div className="space-y-2">
                <Label htmlFor="co-qty">
                  Actual output ({order.uom}) — target was {order.targetQty}
                </Label>
                <Input id="co-qty" name="actualQty" type="number" min={0} step="any" required />
              </div>
              <p className="text-xs text-muted-foreground">
                Completing creates the batch, records traceability, and adds finished goods to stock.
              </p>
            </FormDialog>
          )}
          {batch && (
            <Link href={`/batches/${batch.id}`}>
              <Button size="sm" variant="outline">
                Batch {batch.batchNo} · {batch.yieldPct.toFixed(1)}% yield
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stage pipeline */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Manufacturing Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1">
            {stages.map((stage) => {
              const stageReadingRows = readings.filter((r) => r.orderStageId === stage.id);
              const isActive = stage.status === "in_progress";
              return (
                <li key={stage.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {stage.status === "completed" ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : isActive ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground">
                        <CircleDashed className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="w-px flex-1 bg-border last:hidden" />
                  </div>
                  <div className={`flex-1 pb-4 ${isActive ? "" : "opacity-80"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                        {stage.seq}. {stage.name}
                      </span>
                      {stage.requiresReadings && (
                        <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {isActive && (
                        <div className="ml-auto flex gap-1.5">
                          {stage.requiresReadings && (
                            <ReadingDialog
                              stageId={stage.id}
                              assignedBeds={bedOptions.filter((b) => assignedBedIds.includes(b.id))}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(() => completeStage(stage.id), `${stage.name} completed`)
                            }
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Done
                          </Button>
                        </div>
                      )}
                    </div>
                    {stage.completedAt && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Completed {fmtDateTime(stage.completedAt)}
                      </div>
                    )}
                    {stageReadingRows.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {stageReadingRows.map((r) => (
                          <Badge key={r.id} variant="secondary" className="font-mono text-xs">
                            {r.parameter} {r.value}
                            {r.unit ?? ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Reading log */}
      {readings.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Reading Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-sm">
              {readings.map((r) => (
                <div key={r.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {fmtDateTime(r.recordedAt)}
                  </span>
                  <span className="font-medium capitalize">{r.parameter}</span>
                  <span className="font-mono">
                    {r.value}
                    {r.unit ?? ""}
                  </span>
                  <span className="text-xs text-muted-foreground">by {r.recordedByName}</span>
                  {r.notes && <span className="text-xs text-muted-foreground">— {r.notes}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BedAssignDialog({
  orderId,
  bedOptions,
  assignedBedIds,
}: {
  orderId: number;
  bedOptions: BedOption[];
  assignedBedIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set(assignedBedIds));

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function save() {
    startTransition(async () => {
      const result = await assignBeds(orderId, [...selected]);
      if (result.ok) {
        toast.success("Beds assigned");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed");
      }
    });
  }

  const zones = [...new Set(bedOptions.map((b) => b.code.split("-")[0]))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
              <MapPin className="mr-1 h-3 w-3" /> Assign
            </Button>
          </span>
        }
        nativeButton={false}
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Beds</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {zones.map((zone) => (
            <div key={zone}>
              <div className="mb-1.5 text-sm font-medium">{zone === "Z1" ? "Zone 1" : "Zone 2"}</div>
              <div className="flex flex-wrap gap-1.5">
                {bedOptions
                  .filter((b) => b.code.startsWith(zone))
                  .map((b) => {
                    const isSelected = selected.has(b.id);
                    const disabled = !b.available;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={disabled}
                        title={disabled ? `Occupied by ${b.occupantOrderNo}` : b.code}
                        onClick={() => toggle(b.id)}
                        className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                          disabled
                            ? "cursor-not-allowed border-border bg-muted text-muted-foreground/50 line-through"
                            : isSelected
                              ? "border-emerald-700 bg-emerald-600 text-white"
                              : "border-border hover:bg-accent"
                        }`}
                      >
                        {b.code}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {selected.size} bed{selected.size === 1 ? "" : "s"} selected. Struck-out beds are
            occupied by other orders.
          </p>
          <DialogFooter>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save Assignment"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReadingDialog({
  stageId,
  assignedBeds,
}: {
  stageId: number;
  assignedBeds: BedOption[];
}) {
  const [parameter, setParameter] = useState("temperature");
  return (
    <FormDialog
      title="Record Reading"
      action={recordReading}
      submitLabel="Record"
      trigger={
        <Button size="sm" variant="outline">
          <Thermometer className="mr-1 h-3.5 w-3.5" /> Reading
        </Button>
      }
    >
      <input type="hidden" name="stageId" value={stageId} />
      {assignedBeds.length === 1 && <input type="hidden" name="bedId" value={assignedBeds[0].id} />}
      {assignedBeds.length >= 2 && (
        <div className="space-y-2">
          <Label htmlFor="rd-bed">Bed</Label>
          <NativeSelect id="rd-bed" name="bedId" required>
            {assignedBeds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rd-param">Parameter</Label>
          <NativeSelect
            id="rd-param"
            name="parameter"
            value={parameter}
            onChange={(e) => setParameter(e.target.value)}
          >
            <option value="temperature">Temperature (°C)</option>
            <option value="moisture">Moisture (%)</option>
            <option value="ph">pH</option>
            <option value="turning">Turning (count)</option>
            <option value="other">Other</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rd-value">Value</Label>
          <Input id="rd-value" name="value" type="number" step="any" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="rd-notes">Notes</Label>
        <Textarea id="rd-notes" name="notes" rows={2} />
      </div>
    </FormDialog>
  );
}
