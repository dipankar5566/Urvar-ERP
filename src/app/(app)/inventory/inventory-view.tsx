"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, AlertTriangle, Download, ArrowLeftRight } from "lucide-react";
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
import { createGoodsReceipt, createAdjustment, createTransfer } from "@/modules/inventory/actions";
import { categoryLabel, type Item, type Warehouse, type WarehouseZone } from "@/modules/masters/types";
import type {
  StockRow,
  TransactionRow,
  AvailableBatchRow,
  ExpiringBatches,
  AgingRow,
  AgingBucket,
  StockTrend,
} from "@/modules/inventory/queries";
import { StockTrendCard } from "./stock-trend-card";
import type { OpenPOLineRow } from "@/modules/procurement/queries";
import type { SessionUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import { fmtQty } from "@/lib/format";

const TXN_LABELS: Record<string, string> = {
  goods_receipt: "Goods Receipt",
  issue_to_production: "Issue to Production",
  issue_to_bed_maintenance: "Bed Maintenance",
  production_output: "Production Output",
  adjustment: "Adjustment",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
};

const BUCKET_VARIANT: Record<AgingBucket, "secondary" | "outline" | "destructive"> = {
  Fresh: "secondary",
  Aging: "outline",
  Stale: "outline",
  Dead: "destructive",
};

export function InventoryView({
  user,
  stock,
  transactions,
  items,
  warehouses,
  zones,
  availableBatches,
  expiring,
  aging,
  openPOLines,
  stockTrend,
}: {
  user: SessionUser;
  stock: StockRow[];
  transactions: TransactionRow[];
  items: Item[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  availableBatches: AvailableBatchRow[];
  expiring: ExpiringBatches;
  aging: AgingRow[];
  openPOLines: OpenPOLineRow[];
  stockTrend: StockTrend;
}) {
  const receivableItems = items.filter((i) => i.category !== "finished_good" && i.active);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const alertCount = expiring.expired.length + expiring.nearExpiry.length;

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
            <GoodsReceiptFields
              items={receivableItems}
              warehouses={warehouses}
              zones={zones}
              openPOLines={openPOLines}
              today={today}
            />
          </FormDialog>

          <FormDialog
            title="Warehouse Transfer"
            action={createTransfer}
            submitLabel="Transfer"
            trigger={
              <Button size="sm" variant="outline">
                <ArrowLeftRight className="mr-1 h-4 w-4" /> Transfer
              </Button>
            }
          >
            <TransferFields
              items={items}
              warehouses={warehouses}
              zones={zones}
              availableBatches={availableBatches}
            />
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
              <AdjustmentFields
                items={items}
                warehouses={warehouses}
                zones={zones}
                availableBatches={availableBatches}
              />
            </FormDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="stock" className="mt-6">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="expiry">
            Expiry
            {alertCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {alertCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-4">
          <StockTrendCard trend={stockTrend} />
        </TabsContent>

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
                        {fmtQty(s.qty)} {s.uom}
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
                      className={`text-right font-mono ${t.qty < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {t.qty > 0 ? "+" : ""}
                      {fmtQty(t.qty)} {t.uom}
                    </TableCell>
                    <TableCell className="text-sm">{t.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expiry" className="mt-4 space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Expired ({expiring.expired.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.expired.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No expired batches with stock.
                      </TableCell>
                    </TableRow>
                  )}
                  {expiring.expired.map((b) => (
                    <TableRow key={b.batchId}>
                      <TableCell className="font-medium">{b.batchNo}</TableCell>
                      <TableCell>{b.productName}</TableCell>
                      <TableCell>{b.expiryDate}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtQty(b.qty)} {b.uom}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{Math.abs(b.daysUntilExpiry)}d overdue</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Expiring Soon — within 90 days ({expiring.nearExpiry.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.nearExpiry.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        Nothing expiring within 90 days.
                      </TableCell>
                    </TableRow>
                  )}
                  {expiring.nearExpiry.map((b) => (
                    <TableRow key={b.batchId}>
                      <TableCell className="font-medium">{b.batchNo}</TableCell>
                      <TableCell>{b.productName}</TableCell>
                      <TableCell>{b.expiryDate}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtQty(b.qty)} {b.uom}
                      </TableCell>
                      <TableCell>
                        <Badge className="border-warning text-warning" variant="outline">
                          {b.daysUntilExpiry}d left
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Item / Product</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Age (days)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No stock to age.
                    </TableCell>
                  </TableRow>
                )}
                {aging.map((r) => (
                  <TableRow key={`${r.kind}-${r.id}`}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">{r.kind}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-sm">{r.sinceDate}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtQty(r.qty)} {r.uom}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.ageDays}</TableCell>
                    <TableCell>
                      <Badge variant={BUCKET_VARIANT[r.bucket]}>{r.bucket}</Badge>
                    </TableCell>
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

// Optional zone <select> — only rendered once the chosen warehouse actually
// has zones, so nobody who hasn't set any up ever sees this control.
function ZoneSelect({
  id,
  name,
  label,
  warehouseId,
  zones,
}: {
  id: string;
  name: string;
  label: string;
  warehouseId: number;
  zones: WarehouseZone[];
}) {
  const choices = zones.filter((z) => z.warehouseId === warehouseId && z.active);
  if (choices.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={name} defaultValue="">
        <option value="">No zone</option>
        {choices.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function GoodsReceiptFields({
  items,
  warehouses,
  zones,
  openPOLines,
  today,
}: {
  items: Item[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  openPOLines: OpenPOLineRow[];
  today: string;
}) {
  const [warehouseId, setWarehouseId] = useState<number>(warehouses[0]?.id ?? 0);
  const [poLineId, setPoLineId] = useState<number>(0);
  const selectedLine = openPOLines.find((l) => l.id === poLineId);
  const remaining = selectedLine ? Number((selectedLine.qty - selectedLine.receivedQty).toFixed(3)) : undefined;

  return (
    <>
      {openPOLines.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="gr-po">Purchase Order (optional)</Label>
          <NativeSelect
            id="gr-po"
            value={poLineId}
            onChange={(e) => setPoLineId(Number(e.target.value))}
          >
            <option value={0}>None (ad-hoc)</option>
            {openPOLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.poNo} — {l.itemName} ({fmtQty(l.qty - l.receivedQty)} {l.uom} remaining) —{" "}
                {l.vendorName}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {selectedLine ? (
        <>
          <input type="hidden" name="poLineId" value={selectedLine.id} />
          <input type="hidden" name="itemId" value={selectedLine.itemId} />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Item</div>
              <div className="font-medium">{selectedLine.itemName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Vendor</div>
              <div className="font-medium">{selectedLine.vendorName}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="gr-item">Item</Label>
          <NativeSelect id="gr-item" name="itemId" required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.uom})
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="gr-qty">Quantity</Label>
          {/* Keyed on poLineId so picking a different line resets the field
              to a fresh default. A plain defaultValue={remaining} would keep
              re-initializing the same mounted input whenever openPOLines
              refreshes (e.g. the revalidate after submit, while this dialog
              is still open) — Base UI's uncontrolled FieldControl warns
              about that. QtyInput freezes its default at mount via a lazy
              useState initializer, so later prop churn is ignored. */}
          <QtyInput key={poLineId} defaultQty={remaining} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gr-wh">Warehouse</Label>
          <NativeSelect
            id="gr-wh"
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
      <ZoneSelect id="gr-zone" name="zoneId" label="Zone (optional)" warehouseId={warehouseId} zones={zones} />
      {selectedLine ? (
        <p className="text-xs text-muted-foreground">Rate: {selectedLine.rate} (from {selectedLine.poNo})</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="gr-supplier">Supplier</Label>
            <Input id="gr-supplier" name="supplierName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gr-rate">Rate per unit (optional)</Label>
            <Input id="gr-rate" name="rate" type="number" min={0} step="any" placeholder="For cost tracking" />
          </div>
        </>
      )}
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
    </>
  );
}

// Uncontrolled quantity input whose default is frozen at mount (lazy useState
// initializer, never re-synced from props). Remount it via `key` to pick up a
// new default deliberately — see the comment at its call site.
function QtyInput({ defaultQty }: { defaultQty?: number }) {
  const [frozenDefault] = useState(defaultQty);
  return (
    <Input id="gr-qty" name="qty" type="number" min={0} step="any" defaultValue={frozenDefault} required />
  );
}

// Adjustment form body — needs its own state so the batch picker (only
// relevant for finished_good items, gated on QC status) can appear/disappear
// as the item selection changes, and re-scope to the chosen warehouse.
function AdjustmentFields({
  items,
  warehouses,
  zones,
  availableBatches,
}: {
  items: Item[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
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
      <ZoneSelect id="adj-zone" name="zoneId" label="Zone (optional)" warehouseId={warehouseId} zones={zones} />
      {isFinishedGood && (
        <div className="space-y-2">
          <Label htmlFor="adj-batch">Batch (required for finished goods)</Label>
          <NativeSelect id="adj-batch" name="batchId" required>
            {batchChoices.length === 0 && <option value="">No batches with stock here</option>}
            {batchChoices.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.batchNo} — {b.qcStatus} ({fmtQty(b.qty)} on hand)
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

// Transfer form body — item, conditional batch picker for finished goods
// (same pattern as AdjustmentFields), source/destination warehouse (with
// optional zone pickers scoped to whichever warehouse they belong under).
// Not QC-gated: a transfer is a location change, not a dispatch.
function TransferFields({
  items,
  warehouses,
  zones,
  availableBatches,
}: {
  items: Item[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  availableBatches: AvailableBatchRow[];
}) {
  const [itemId, setItemId] = useState<number>(items[0]?.id ?? 0);
  const [fromWarehouseId, setFromWarehouseId] = useState<number>(warehouses[0]?.id ?? 0);
  const [toWarehouseId, setToWarehouseId] = useState<number>(warehouses[1]?.id ?? warehouses[0]?.id ?? 0);
  const selectedItem = items.find((i) => i.id === itemId);
  const isFinishedGood = selectedItem?.category === "finished_good";
  const batchChoices = availableBatches.filter(
    (b) => b.itemId === itemId && b.warehouseId === fromWarehouseId
  );

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="trf-item">Item</Label>
        <NativeSelect
          id="trf-item"
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
      {isFinishedGood && (
        <div className="space-y-2">
          <Label htmlFor="trf-batch">Batch (required for finished goods)</Label>
          <NativeSelect id="trf-batch" name="batchId" required>
            {batchChoices.length === 0 && <option value="">No batches with stock here</option>}
            {batchChoices.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.batchNo} — {b.qcStatus} ({fmtQty(b.qty)} on hand)
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Transfers move a batch between warehouses regardless of QC status.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="trf-from">From warehouse</Label>
          <NativeSelect
            id="trf-from"
            name="fromWarehouseId"
            value={fromWarehouseId}
            onChange={(e) => setFromWarehouseId(Number(e.target.value))}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="trf-to">To warehouse</Label>
          <NativeSelect
            id="trf-to"
            name="toWarehouseId"
            value={toWarehouseId}
            onChange={(e) => setToWarehouseId(Number(e.target.value))}
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
      <div className="grid grid-cols-2 gap-3">
        <ZoneSelect
          id="trf-from-zone"
          name="fromZoneId"
          label="From zone (optional)"
          warehouseId={fromWarehouseId}
          zones={zones}
        />
        <ZoneSelect
          id="trf-to-zone"
          name="toZoneId"
          label="To zone (optional)"
          warehouseId={toWarehouseId}
          zones={zones}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trf-qty">Quantity</Label>
        <Input id="trf-qty" name="qty" type="number" min={0} step="any" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trf-remarks">Remarks</Label>
        <Textarea id="trf-remarks" name="remarks" rows={2} />
      </div>
    </>
  );
}
