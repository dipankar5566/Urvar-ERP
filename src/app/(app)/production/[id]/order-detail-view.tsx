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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import {
  startProductionOrder,
  completeStage,
  recordReading,
  completeProductionOrder,
  cancelProductionOrder,
} from "@/modules/production/actions";
import type { OrderDetail } from "@/modules/production/queries";
import { STATUS_BADGE } from "../production-view";

export function OrderDetailView({ detail }: { detail: OrderDetail }) {
  const { order, stages, readings, batch } = detail;
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[order.status];
  const activeStage = stages.find((s) => s.status === "in_progress");

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
                          {stage.requiresReadings && <ReadingDialog stageId={stage.id} />}
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
                        Completed {stage.completedAt.slice(0, 16).replace("T", " ")}
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
                    {r.recordedAt.slice(0, 16).replace("T", " ")}
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

function ReadingDialog({ stageId }: { stageId: number }) {
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
