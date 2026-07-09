"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Eye } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/form-dialog";
import {
  savePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
} from "@/modules/procurement/actions";
import { PO_STATUS_LABEL } from "@/modules/procurement/types";
import type {
  PurchaseOrderRow,
  PurchaseOrderLineRow,
  RateHistoryRow,
} from "@/modules/procurement/queries";
import type { Vendor, Item } from "@/modules/masters/types";
import type { SessionUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import { fmtQty, fmtMoney } from "@/lib/format";
import { PO_STATUS_VARIANT } from "@/modules/procurement/badges";

type LineDraft = { itemId: number; qty: number; uom: string; rate: number };

export function ProcurementView({
  user,
  vendors,
  purchaseOrders,
  lines,
  rateHistory,
  items,
}: {
  user: SessionUser;
  vendors: Vendor[];
  purchaseOrders: PurchaseOrderRow[];
  lines: PurchaseOrderLineRow[];
  rateHistory: RateHistoryRow[];
  items: Item[];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Procurement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendors, purchase orders, and what&apos;s on order.
          </p>
        </div>
        <PODialog
          vendors={vendors}
          items={items}
          rateHistory={rateHistory}
          trigger={
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> New PO
            </Button>
          }
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO No</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expected Delivery</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No purchase orders yet.
                </TableCell>
              </TableRow>
            )}
            {purchaseOrders.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium">{po.poNo}</TableCell>
                <TableCell>{po.vendorName}</TableCell>
                <TableCell>
                  <Badge variant={PO_STATUS_VARIANT[po.status] ?? "outline"}>
                    {PO_STATUS_LABEL[po.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {po.expectedDeliveryDate ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono">{po.lineCount}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtMoney(po.totalValue)}
                </TableCell>
                <TableCell className="text-sm">{po.createdByName}</TableCell>
                <TableCell>
                  <PODetailDialog
                    po={po}
                    lines={lines.filter((l) => l.poId === po.id)}
                    vendors={vendors}
                    items={items}
                    rateHistory={rateHistory}
                    isAdmin={user.role === "admin"}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="View">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------- New / Edit PO dialog ----------

export function PODialog({
  po,
  existingLines,
  vendors,
  items,
  rateHistory,
  initialItemId,
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  po?: PurchaseOrderRow;
  existingLines?: PurchaseOrderLineRow[];
  vendors: Vendor[];
  items: Item[];
  rateHistory: RateHistoryRow[];
  initialItemId?: number;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [pending, startTransition] = useTransition();

  const initialVendorId =
    (initialItemId && lastVendorFor(rateHistory, initialItemId)) ?? vendors[0]?.id ?? 0;
  const [vendorId, setVendorId] = useState<number>(po ? findVendorId(po, vendors) : initialVendorId);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(po?.expectedDeliveryDate ?? "");
  const [remarks, setRemarks] = useState(po?.remarks ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    existingLines?.map((l) => ({ itemId: l.itemId, qty: l.qty, uom: l.uom, rate: l.rate })) ?? [
      makeLine(initialItemId ?? items[0]?.id ?? 0, items, rateHistory, initialVendorId),
    ]
  );

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function setLineItem(idx: number, itemId: number) {
    const item = items.find((i) => i.id === itemId);
    const rate = lastRate(rateHistory, vendorId, itemId) ?? lines[idx].rate;
    updateLine(idx, { itemId, uom: item?.uom ?? "kg", rate });
  }

  function changeVendor(nextVendorId: number) {
    setVendorId(nextVendorId);
    // Re-suggest rates for every existing line against the new vendor.
    setLines((prev) =>
      prev.map((l) => {
        const suggested = lastRate(rateHistory, nextVendorId, l.itemId);
        return suggested !== null ? { ...l, rate: suggested } : l;
      })
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await savePurchaseOrder({
        id: po?.id,
        vendorId,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        remarks,
        lines,
      });
      if (result.ok) {
        toast.success(po ? "Purchase order updated" : "Purchase order created");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={<span>{trigger}</span>} nativeButton={false} />}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{po ? `Edit ${po.poNo}` : "New Purchase Order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <NativeSelect value={vendorId} onChange={(e) => changeVendor(Number(e.target.value))}>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Expected delivery</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines([...lines, makeLine(items[0]?.id ?? 0, items, rateHistory, vendorId)])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <NativeSelect
                    className="flex-1"
                    value={line.itemId}
                    onChange={(e) => setLineItem(idx, Number(e.target.value))}
                  >
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Qty"
                    value={line.qty || ""}
                    onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                  />
                  <span className="w-8 text-xs text-muted-foreground">{line.uom}</span>
                  <Input
                    className="w-24"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Rate"
                    value={line.rate || ""}
                    onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button onClick={submit} disabled={pending || !vendorId || lines.some((l) => !l.qty)}>
              {pending ? "Saving…" : po ? "Save changes" : "Create draft"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail / status-action dialog ----------

function PODetailDialog({
  po,
  lines,
  vendors,
  items,
  rateHistory,
  isAdmin,
  trigger,
}: {
  po: PurchaseOrderRow;
  lines: PurchaseOrderLineRow[];
  vendors: Vendor[];
  items: Item[];
  rateHistory: RateHistoryRow[];
  isAdmin: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function runAction(fn: (id: number) => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      const result = await fn(po.id);
      if (result.ok) {
        toast.success(successMsg);
        setOpen(false);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<span>{trigger}</span>} nativeButton={false} />
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {po.poNo}
              <Badge variant={PO_STATUS_VARIANT[po.status] ?? "outline"}>{PO_STATUS_LABEL[po.status]}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Vendor</div>
                <div className="font-medium">{po.vendorName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Expected delivery</div>
                <div className="font-medium">{po.expectedDeliveryDate ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Created by</div>
                <div className="font-medium">{po.createdByName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="font-medium">{fmtDateTime(po.createdAt)}</div>
              </div>
            </div>
            {po.remarks && (
              <div>
                <div className="text-xs text-muted-foreground">Remarks</div>
                <div>{po.remarks}</div>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.itemName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtQty(l.qty)} {l.uom}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtQty(l.receivedQty)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtQty(l.qty - l.receivedQty)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(l.rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {po.status === "draft" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setEditOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
                {isAdmin && po.status === "draft" && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => runAction(approvePurchaseOrder, "Purchase order approved")}
                  >
                    Approve
                  </Button>
                )}
                {isAdmin && (po.status === "draft" || po.status === "approved") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => runAction(cancelPurchaseOrder, "Purchase order cancelled")}
                  >
                    Cancel
                  </Button>
                )}
                {isAdmin && (po.status === "approved" || po.status === "partially_received") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const totalReceived = lines.reduce((sum, l) => sum + l.receivedQty, 0);
                      // Closing is permanent — Goods Receipt only accepts approved/
                      // partially_received POs, so this is the point of no return.
                      // Nothing received yet is almost always a mis-click, not intent.
                      if (
                        totalReceived === 0 &&
                        !window.confirm(
                          "Nothing has been received against this PO yet. Closing it now means it can never be received against — the ordered quantity will be lost unless you create a new PO. Close anyway?"
                        )
                      ) {
                        return;
                      }
                      runAction(closePurchaseOrder, "Purchase order closed");
                    }}
                  >
                    Close
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <PODialog
          po={po}
          existingLines={lines}
          vendors={vendors}
          items={items}
          rateHistory={rateHistory}
          open={editOpen}
          onOpenChange={(next) => {
            setEditOpen(next);
            if (!next) setOpen(false);
          }}
        />
      )}
    </>
  );
}

// ---------- helpers ----------

function lastRate(rateHistory: RateHistoryRow[], vendorId: number, itemId: number): number | null {
  return rateHistory.find((r) => r.vendorId === vendorId && r.itemId === itemId)?.rate ?? null;
}

function lastVendorFor(rateHistory: RateHistoryRow[], itemId: number): number | null {
  return rateHistory.find((r) => r.itemId === itemId)?.vendorId ?? null;
}

function makeLine(itemId: number, items: Item[], rateHistory: RateHistoryRow[], vendorId: number): LineDraft {
  const item = items.find((i) => i.id === itemId);
  return {
    itemId,
    qty: 0,
    uom: item?.uom ?? "kg",
    rate: lastRate(rateHistory, vendorId, itemId) ?? 0,
  };
}

function findVendorId(po: PurchaseOrderRow, vendors: Vendor[]): number {
  return vendors.find((v) => v.name === po.vendorName)?.id ?? vendors[0]?.id ?? 0;
}
