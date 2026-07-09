"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items, lots, batches, transfers, vendors, purchaseOrders, purchaseOrderLines } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { atomic, postTransaction, writeAudit } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import { pickFifoLots } from "@/lib/fifo";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ---------- Goods Receipt ----------

const receiptSchema = z.object({
  itemId: z.coerce.number().min(1, "Item is required"),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
  zoneId: z.coerce.number().min(1).optional(),
  // Optional PO/vendor linkage — omitting both keeps today's ad-hoc behavior
  // exactly as-is (free-text supplierName, no vendor/PO record attached).
  poLineId: z.coerce.number().min(1).optional(),
  vendorId: z.coerce.number().min(1).optional(),
  supplierName: z.string().trim().optional(),
  qty: z.coerce.number().positive("Quantity must be positive"),
  receivedDate: z.string().min(1, "Date is required"),
  vehicleNo: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  // Only meaningful for ad-hoc (no PO line) receipts — PO-linked receipts
  // always take their rate from the PO line itself, see below.
  rate: z.coerce.number().min(0).optional(),
});

export async function createGoodsReceipt(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["zoneId", "poLineId", "vendorId", "supplierName", "rate"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = receiptSchema.parse(raw);

    const item = db.select().from(items).where(eq(items.id, data.itemId)).get();
    if (!item) return { ok: false, error: "Item not found" };

    let poLine: typeof purchaseOrderLines.$inferSelect | undefined;
    let po: typeof purchaseOrders.$inferSelect | undefined;
    let vendorId = data.vendorId;

    if (data.poLineId) {
      poLine = db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.id, data.poLineId)).get();
      if (!poLine) return { ok: false, error: "Purchase order line not found" };
      if (poLine.itemId !== data.itemId) {
        return { ok: false, error: "Selected item does not match the purchase order line" };
      }
      po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poLine.poId)).get();
      if (!po) return { ok: false, error: "Purchase order not found" };
      if (po.status !== "approved" && po.status !== "partially_received") {
        return {
          ok: false,
          error: `Purchase order ${po.poNo} is not open for receiving (status: ${po.status.replace("_", " ")})`,
        };
      }
      vendorId = po.vendorId;
    }

    let vendor: typeof vendors.$inferSelect | undefined;
    let supplierName = data.supplierName;
    if (vendorId) {
      vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
      if (!vendor) return { ok: false, error: "Vendor not found" };
      supplierName = vendor.name;
    }
    if (!supplierName) {
      return { ok: false, error: "Supplier is required" };
    }

    atomic(() => {
      const lotNo = nextDocNumber("LOT");
      const lot = db
        .insert(lots)
        .values({
          lotNo,
          itemId: data.itemId,
          supplierName,
          vendorId: vendor?.id,
          poId: po?.id,
          poLineId: poLine?.id,
          receivedQty: data.qty,
          uom: item.uom,
          receivedDate: data.receivedDate,
          vehicleNo: data.vehicleNo,
          remarks: data.remarks,
          // PO-linked: always the PO's own rate (authoritative, not
          // re-enterable here). Ad-hoc: whatever rate was entered, if any —
          // left null if the field was skipped, not defaulted to zero.
          rate: poLine ? poLine.rate : data.rate,
          createdBy: user.id,
        })
        .returning()
        .get();

      postTransaction({
        type: "goods_receipt",
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        zoneId: data.zoneId,
        lotId: lot.id,
        qty: data.qty,
        uom: item.uom,
        refType: "lot",
        refId: lot.id,
        userId: user.id,
      });

      // Fold the receipt into the PO's fulfillment tally and recompute status.
      if (poLine && po) {
        const newReceived = poLine.receivedQty + data.qty;
        db.update(purchaseOrderLines)
          .set({ receivedQty: newReceived })
          .where(eq(purchaseOrderLines.id, poLine.id))
          .run();

        const siblingLines = db
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.poId, poLine.poId))
          .all()
          .map((l) => (l.id === poLine!.id ? { ...l, receivedQty: newReceived } : l));
        const allReceived = siblingLines.every((l) => l.receivedQty >= l.qty - 1e-9);
        const anyReceived = siblingLines.some((l) => l.receivedQty > 1e-9);
        const nextStatus = allReceived ? "closed" : anyReceived ? "partially_received" : "approved";
        if (nextStatus !== po.status) {
          db.update(purchaseOrders).set({ status: nextStatus }).where(eq(purchaseOrders.id, poLine.poId)).run();
        }
      }

      writeAudit({
        actorId: user.id,
        action: "inventory.goods_receipt",
        entity: "lots",
        entityId: lot.id,
        after: { ...data, lotNo },
      });
    });

    revalidatePath("/inventory");
    revalidatePath("/procurement");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Stock Adjustment (admin only) ----------

const adjustmentSchema = z.object({
  itemId: z.coerce.number().min(1, "Item is required"),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
  zoneId: z.coerce.number().min(1).optional(),
  batchId: z.coerce.number().min(1).optional(),
  qty: z.coerce
    .number()
    .refine((v) => v !== 0, "Quantity cannot be zero"),
  reason: z.string().trim().min(5, "A reason is required (min 5 characters)"),
});

export async function createAdjustment(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const raw = Object.fromEntries(formData);
    if (raw.batchId === "") delete raw.batchId;
    if (raw.zoneId === "") delete raw.zoneId;
    const data = adjustmentSchema.parse(raw);

    const item = db.select().from(items).where(eq(items.id, data.itemId)).get();
    if (!item) return { ok: false, error: "Item not found" };

    // Finished goods are batch-tracked: require picking a batch, and block
    // stock-out (negative qty) against anything not yet QC-released. This is
    // the dispatch gate — there's no separate Dispatch module yet, so this
    // is the one place finished-goods stock can currently leave the system.
    if (item.category === "finished_good") {
      if (!data.batchId) {
        return { ok: false, error: "Select which batch this adjustment applies to" };
      }
      const batch = db.select().from(batches).where(eq(batches.id, data.batchId)).get();
      if (!batch) return { ok: false, error: "Batch not found" };
      if (batch.productId !== item.productId) {
        return { ok: false, error: "That batch does not belong to the selected item" };
      }
      if (data.qty < 0 && batch.qcStatus !== "released") {
        return {
          ok: false,
          error: `Batch ${batch.batchNo} is not QC-released (status: ${batch.qcStatus}) — cannot remove stock`,
        };
      }
    }

    atomic(() => {
      postTransaction({
        type: "adjustment",
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        zoneId: data.zoneId,
        batchId: item.category === "finished_good" ? data.batchId : undefined,
        qty: data.qty,
        uom: item.uom,
        refType: "manual",
        reason: data.reason,
        userId: admin.id,
      });
      writeAudit({
        actorId: admin.id,
        action: "inventory.adjustment",
        entity: "inventory_transactions",
        after: data,
      });
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Warehouse Transfer ----------
// Not QC-gated — a transfer is a location change, not a dispatch. The
// dispatch gate (createAdjustment above) still applies wherever finished
// goods actually leave the system.

const transferSchema = z.object({
  itemId: z.coerce.number().min(1, "Item is required"),
  batchId: z.coerce.number().min(1).optional(),
  qty: z.coerce.number().positive("Quantity must be positive"),
  fromWarehouseId: z.coerce.number().min(1, "Source warehouse is required"),
  toWarehouseId: z.coerce.number().min(1, "Destination warehouse is required"),
  fromZoneId: z.coerce.number().min(1).optional(),
  toZoneId: z.coerce.number().min(1).optional(),
  remarks: z.string().trim().optional(),
});

export async function createTransfer(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["batchId", "fromZoneId", "toZoneId"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = transferSchema.parse(raw);

    if (data.fromWarehouseId === data.toWarehouseId) {
      return { ok: false, error: "Source and destination warehouse must be different" };
    }

    const item = db.select().from(items).where(eq(items.id, data.itemId)).get();
    if (!item) return { ok: false, error: "Item not found" };

    let batch: typeof batches.$inferSelect | undefined;
    if (item.category === "finished_good") {
      if (!data.batchId) {
        return { ok: false, error: "Select which batch this transfer applies to" };
      }
      batch = db.select().from(batches).where(eq(batches.id, data.batchId)).get();
      if (!batch) return { ok: false, error: "Batch not found" };
      if (batch.productId !== item.productId) {
        return { ok: false, error: "That batch does not belong to the selected item" };
      }
    }

    atomic(() => {
      const transferNo = nextDocNumber("TRF");
      const transfer = db
        .insert(transfers)
        .values({
          transferNo,
          itemId: data.itemId,
          batchId: batch?.id,
          qty: data.qty,
          uom: item.uom,
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          fromZoneId: data.fromZoneId,
          toZoneId: data.toZoneId,
          remarks: data.remarks,
          createdBy: user.id,
        })
        .returning()
        .get();

      // batchId: one specific batch. Otherwise: FIFO across lots, possibly
      // spanning several — each pick gets its own transfer_out/transfer_in
      // pair, same lotId on both sides so identity survives the move.
      // fromZoneId (if the user set one) scopes which zone FIFO picks from;
      // the transfer_out posting then uses each pick's own zoneId rather
      // than blindly reusing fromZoneId, since a warehouse with several
      // zones can have the same item split across more than one of them —
      // using the wrong zone here targets a stock_balances row that isn't
      // actually where the picked stock lives and throws a false shortage.
      const picks = batch
        ? [{ lotId: null, zoneId: data.fromZoneId ?? null, qty: data.qty }]
        : pickFifoLots(data.itemId, data.fromWarehouseId, data.qty, data.fromZoneId);

      for (const pick of picks) {
        postTransaction({
          type: "transfer_out",
          itemId: data.itemId,
          warehouseId: data.fromWarehouseId,
          zoneId: pick.zoneId,
          lotId: pick.lotId,
          batchId: batch?.id,
          qty: -pick.qty,
          uom: item.uom,
          refType: "transfer",
          refId: transfer.id,
          userId: user.id,
        });
        postTransaction({
          type: "transfer_in",
          itemId: data.itemId,
          warehouseId: data.toWarehouseId,
          zoneId: data.toZoneId,
          lotId: pick.lotId,
          batchId: batch?.id,
          qty: pick.qty,
          uom: item.uom,
          refType: "transfer",
          refId: transfer.id,
          userId: user.id,
        });
      }

      writeAudit({
        actorId: user.id,
        action: "inventory.transfer",
        entity: "transfers",
        entityId: transfer.id,
        after: { transferNo, ...data },
      });
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
