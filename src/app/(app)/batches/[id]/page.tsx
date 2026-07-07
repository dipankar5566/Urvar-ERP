import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { getBatchDetail } from "@/modules/batches/queries";
import { QC_BADGE } from "@/modules/batches/badges";
import { getBatchTestResults } from "@/modules/quality/queries";
import { BatchQcSection } from "./batch-qc-section";
import { fmtDateTime } from "@/lib/dates";

export default async function BatchDetailPage(props: PageProps<"/batches/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const detail = getBatchDetail(Number(id));
  if (!detail) notFound();

  const { batch, inputs, stages, readings, currentStock } = detail;
  const qc = QC_BADGE[batch.qcStatus];
  const testResults = getBatchTestResults(batch.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/batches"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Batches
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{batch.batchNo}</h1>
        <Badge variant={qc.variant}>{qc.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {batch.productName} · {batch.qtyProduced} {batch.uom} produced (target {batch.expectedQty}) ·
        Yield {batch.yieldPct.toFixed(1)}% · Order{" "}
        <Link href={`/production/${batch.orderId}`} className="text-primary hover:underline">
          {batch.orderNo}
        </Link>
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Mfg Date" value={batch.mfgDate} />
        <Stat label="Expiry" value={batch.expiryDate} />
        <Stat label="Warehouse" value={batch.warehouseName} />
        <Stat label="In Stock" value={`${Number(currentStock.toFixed(3))} ${batch.uom}`} />
      </div>

      <BatchQcSection batchId={batch.id} qcStatus={batch.qcStatus} results={testResults} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Raw Material Traceability</CardTitle>
        </CardHeader>
        <CardContent>
          {inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lot-tracked inputs recorded for this batch.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Consumed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inputs.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.itemName}</TableCell>
                      <TableCell className="font-mono text-sm">{i.lotNo}</TableCell>
                      <TableCell>{i.supplierName}</TableCell>
                      <TableCell>{i.receivedDate}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(i.qtyConsumed.toFixed(3))} {i.uom}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Stage History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {stages.map((stage) => {
              const stageReadingRows = readings.filter((r) => r.orderStageId === stage.id);
              return (
                <li key={stage.id} className="flex items-start gap-2 text-sm">
                  {stage.status === "completed" ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <span className="font-medium">
                      {stage.seq}. {stage.name}
                    </span>
                    {stage.completedAt && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {fmtDateTime(stage.completedAt)}
                      </span>
                    )}
                    {stageReadingRows.length > 0 && (
                      <span className="ml-2 space-x-1">
                        {stageReadingRows.map((r) => (
                          <Badge
                            key={r.id}
                            variant={r.isDeviation ? "destructive" : "secondary"}
                            className="font-mono text-xs"
                          >
                            {r.parameter} {r.value}
                            {r.unit ?? ""}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
