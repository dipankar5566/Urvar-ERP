"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, AlertTriangle, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import { createGoodsReceipt, createAdjustment } from "@/modules/inventory/actions";
import { categoryLabel, type Item, type Warehouse } from "@/modules/masters/types";
import type { StockRow, TransactionRow, AvailableBatchRow } from "@/modules/inventory/queries";
import type { SessionUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";

const TXN_LABELS: Record<string, string> = {
  goods_receipt: "Goods Receipt",
  issue_to_production: "Issue to Production",
  production_output: "Production Output",
  adjustment: "Adjustment",
};

export function InventoryView({
  user,
  stock,
  transactions,
  items,
  warehouses,
  availableBatches,
}: {
  user: SessionUser;
  stock: StockRow[];
  transactions: TransactionRow[];
  items: Item[];
  warehouses: Warehouse[];
  availableBatches: AvailableBatchRow[];
}) {
  const receivableItems = items.filter((i) => i.category !== "finished_good" && i.active);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function exportLedgerCsv() {
    const header = "Date,Type,Item,Warehouse,Lot,Batch,Qty,UoM,By,Reason\n";
    const rows = transactions
      .map((t) =>
        [
          t.createdAt,
          TXN_LABELS[t.type] ?? t.type,
          t.itemName,
          t.warehouseName,
          t.lotNo ?? "",
          t.batchNo ?? "",
          t.qty,
          t.uom,
          t.userName,
          (t.reason ?? "").replaceAll(",", ";"),
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stock-ledger-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stock is updated automatically by goods receipts and production.
          </p>
        </div>
        <div className="flex gap-2">
          <FormDialog
            title="Goods Receipt"
            action={createGoodsReceipt}
            submitLabel="Receive"
            trigger={
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Goods Receipt
              </Button>
            }
          >
            <div className="space-y-2">
              <Label htmlFor="gr-item">Item</Label>
              <NativeSelect id="gr-item" name="itemId" required>
                {receivableItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.uom})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gr-qty">Quantity</Label>
                <Input id="gr-qty" name="qty" type="number" min={0} step="any" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gr-wh">Warehouse</Label>
                <NativeSelect id="gr-wh" name="warehouseId" required>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gr-supplier">Supplier</Label>
              <Input id="gr-supplier" name="supplierName" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gr-date">Received date</Label>
                <Input id="gr-date" name="receivedDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gr-vehicle">Vehicle no.</Label>
                <Input id="gr-vehicle" name="vehicleNo" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gr-remarks">Remarks</Label>
              <Textarea id="gr-remarks" name="remarks" rows={2} />
            </div>
          </FormDialog>

          {user.role === "admin" && (
            <FormDialog
              title="Stock Adjustment"
              action={createAdjustment}
              submitLabel="Adjust"
              trigger={
                <Button size="sm" variant="outline">
                  <SlidersHorizontal className="mr-1 h-4 w-4" /> Adjustment
                </Button>
              }
            >
              <AdjustmentFields items={items} warehouses={warehouses} availableBatches={availableBatches} />
            </FormDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="stock" className="mt-6">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No stock yet. Record a goods receipt to get started.
                    </TableCell>
                  </TableRow>
                )}
                {stock.map((s) => {
                  const low = s.reorderLevel > 0 && s.qty <= s.reorderLevel;
                  return (
                    <TableRow key={`${s.itemId}-${s.warehouseId}`}>
                      <TableCell className="font-medium">{s.itemName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{categoryLabel(s.category)}</Badge>
                      </TableCell>
                      <TableCell>{s.warehouseName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(s.qty.toFixed(3))} {s.uom}
                      </TableCell>
                      <TableCell>
                        {low && (
                          <Badge variant="destructive">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Low
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportLedgerCsv}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(t.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={t.qty >= 0 ? "secondary" : "outline"}>
                        {TXN_LABELS[t.type] ?? t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.itemName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.lotNo ?? t.batchNo ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${t.qty < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-500"}`}
                    >
                      {t.qty > 0 ? "+" : ""}
                      {Number(t.qty.toFixed(3))} {t.uom}
                    </TableCell>
                    <TableCell className="text-sm">{t.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Adjustment form body — needs its own state so the batch picker (only
// relevant for finished_good items, gated on QC status) can appear/disappear
// as the item selection changes, and re-scope to the chosen warehouse.
function AdjustmentFields({
  items,
  warehouses,
  availableBatches,
}: {
  items: Item[];
  warehouses: Warehouse[];
  availableBatches: AvailableBatchRow[];
}) {
  const [itemId, setItemId] = useState<number>(items[0]?.id ?? 0);
  const [warehouseId, setWarehouseId] = useState<number>(warehouses[0]?.id ?? 0);
  const selectedItem = items.find((i) => i.id === itemId);
  const isFinishedGood = selectedItem?.category === "finished_good";
  const batchChoices = availableBatches.filter(
    (b) => b.itemId === itemId && b.warehouseId === warehouseId
  );

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="adj-item">Item</Label>
        <NativeSelect
          id="adj-item"
          name="itemId"
          value={itemId}
          onChange={(e) => setItemId(Number(e.target.value))}
          required
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.uom})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="adj-qty">Quantity (+ add / − remove)</Label>
          <Input id="adj-qty" name="qty" type="number" step="any" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adj-wh">Warehouse</Label>
          <NativeSelect
            id="adj-wh"
            name="warehouseId"
            value={warehouseId}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {isFinishedGood && (
        <div className="space-y-2">
          <Label htmlFor="adj-batch">Batch (required for finished goods)</Label>
          <NativeSelect id="adj-batch" name="batchId" required>
            {batchChoices.length === 0 && <option value="">No batches with stock here</option>}
            {batchChoices.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.batchNo} — {b.qcStatus} ({Number(b.qty.toFixed(3))} on hand)
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Removing stock (negative qty) is blocked unless the batch is QC-released.
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="adj-reason">Reason (required)</Label>
        <Textarea id="adj-reason" name="reason" rows={2} required />
      </div>
    </>
  );
}
