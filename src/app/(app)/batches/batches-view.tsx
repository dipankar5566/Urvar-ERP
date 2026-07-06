"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BatchRow } from "@/modules/batches/queries";

import { QC_BADGE } from "@/modules/batches/badges";

export function BatchesView({ batches }: { batches: BatchRow[] }) {
  function exportCsv() {
    const header = "Batch,Product,Order,Mfg Date,Expiry,Qty,UoM,Yield %,QC Status,Warehouse\n";
    const rows = batches
      .map((b) =>
        [
          b.batchNo,
          b.productName,
          b.orderNo,
          b.mfgDate,
          b.expiryDate,
          b.qtyProduced,
          b.uom,
          b.yieldPct.toFixed(1),
          b.qcStatus,
          b.warehouseName,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `batches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Batches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every batch is traceable back to its raw material lots.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={batches.length === 0}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Mfg Date</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Yield</TableHead>
              <TableHead>QC</TableHead>
              <TableHead>Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No batches yet — complete a production order to create one.
                </TableCell>
              </TableRow>
            )}
            {batches.map((b) => {
              const qc = QC_BADGE[b.qcStatus];
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/batches/${b.id}`} className="font-medium text-primary hover:underline">
                      {b.batchNo}
                    </Link>
                  </TableCell>
                  <TableCell>{b.productName}</TableCell>
                  <TableCell>{b.mfgDate}</TableCell>
                  <TableCell className="text-right font-mono">
                    {b.qtyProduced} {b.uom}
                  </TableCell>
                  <TableCell className="text-right font-mono">{b.yieldPct.toFixed(1)}%</TableCell>
                  <TableCell>
                    <Badge variant={qc.variant}>{qc.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.orderNo}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
