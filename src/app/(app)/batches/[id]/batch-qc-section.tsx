"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import {
  collectSample,
  startTesting,
  recordTestResult,
  releaseBatch,
  holdBatch,
  retestBatch,
} from "@/modules/quality/actions";
import { fmtDateTime } from "@/lib/dates";
import type { BatchTestResultRow } from "@/modules/quality/queries";

const PARAMETER_LABELS: Record<string, string> = {
  moisture: "Moisture",
  organic_carbon: "Organic Carbon",
  nitrogen: "Nitrogen (N)",
  phosphorus: "Phosphorus (P)",
  potassium: "Potassium (K)",
  cn_ratio: "C:N Ratio",
  ph: "pH",
  ec: "EC",
  bulk_density: "Bulk Density",
  particle_size: "Particle Size",
  appearance: "Appearance",
  odour: "Odour",
  other: "Other",
};

export function BatchQcSection({
  batchId,
  qcStatus,
  results,
}: {
  batchId: number;
  qcStatus: string;
  results: BatchTestResultRow[];
}) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(successMsg);
      else toast.error(result.error ?? "Failed");
    });
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Quality Control</CardTitle>
        <div className="flex gap-1.5">
          {qcStatus === "pending" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => collectSample(batchId), "Sample collected")}
            >
              {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Collect Sample
            </Button>
          )}
          {qcStatus === "sample_collected" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => startTesting(batchId), "Testing started")}
            >
              {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Start Testing
            </Button>
          )}
          {qcStatus === "testing" && (
            <>
              <TestResultDialog batchId={batchId} />
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => releaseBatch(batchId), "Batch released")}
              >
                Release
              </Button>
              <HoldDialog batchId={batchId} />
            </>
          )}
          {(qcStatus === "pending" || qcStatus === "sample_collected") && (
            <HoldDialog batchId={batchId} />
          )}
          {qcStatus === "hold" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => retestBatch(batchId), "Back to testing")}
            >
              {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Retest
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No test results recorded yet.
            {qcStatus === "testing" && " Record at least one before releasing."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parameter</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {PARAMETER_LABELS[r.parameter] ?? r.parameter}
                    </TableCell>
                    <TableCell className="font-mono">
                      {r.value !== null ? `${r.value}${r.unit ?? ""}` : r.textValue ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDateTime(r.recordedAt)}
                    </TableCell>
                    <TableCell className="text-sm">{r.recordedByName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestResultDialog({ batchId }: { batchId: number }) {
  return (
    <FormDialog
      title="Record Test Result"
      action={recordTestResult}
      submitLabel="Record"
      trigger={
        <Button size="sm" variant="outline">
          <FlaskConical className="mr-1 h-3.5 w-3.5" /> Add Result
        </Button>
      }
    >
      <input type="hidden" name="batchId" value={batchId} />
      <div className="space-y-2">
        <Label htmlFor="tr-param">Parameter</Label>
        <NativeSelect id="tr-param" name="parameter" defaultValue="moisture">
          {Object.entries(PARAMETER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tr-value">Value</Label>
          <Input id="tr-value" name="value" type="number" step="any" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tr-unit">Unit</Label>
          <Input id="tr-unit" name="unit" placeholder="%, mg/kg, …" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-text">Text value (for qualitative params)</Label>
        <Input id="tr-text" name="textValue" placeholder="e.g. dark brown, earthy" />
      </div>
    </FormDialog>
  );
}

function HoldDialog({ batchId }: { batchId: number }) {
  return (
    <FormDialog
      title="Put Batch On Hold"
      action={holdBatch}
      submitLabel="Put On Hold"
      trigger={
        <Button size="sm" variant="destructive">
          Hold
        </Button>
      }
    >
      <input type="hidden" name="batchId" value={batchId} />
      <div className="space-y-2">
        <Label htmlFor="hold-reason">Reason (required)</Label>
        <Textarea id="hold-reason" name="reason" rows={2} required />
      </div>
    </FormDialog>
  );
}
