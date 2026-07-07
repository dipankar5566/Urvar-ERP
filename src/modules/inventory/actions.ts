"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items, lots, batches } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { atomic, postTransaction, writeAudit } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ---------- Goods Receipt ----------

const receiptSchema = z.object({
  itemId: z.coerce.number().min(1, "Item is required"),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
  supplierName: z.string().trim().min(1, "Supplier is required"),
  qty: z.coerce.number().positive("Quantity must be positive"),
  receivedDate: z.string().min(1, "Date is required"),
  vehicleNo: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

export async function createGoodsReceipt(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = receiptSchema.parse(Object.fromEntries(formData));

    const item = db.select().from(items).where(eq(items.id, data.itemId)).get();
    if (!item) return { ok: false, error: "Item not found" };

    atomic(() => {
      const lotNo = nextDocNumber("LOT");
      const lot = db
        .insert(lots)
        .values({
          lotNo,
          itemId: data.itemId,
          supplierName: data.supplierName,
          receivedQty: data.qty,
          uom: item.uom,
          receivedDate: data.receivedDate,
          vehicleNo: data.vehicleNo,
          remarks: data.remarks,
          createdBy: user.id,
        })
        .returning()
        .get();

      postTransaction({
        type: "goods_receipt",
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        lotId: lot.id,
        qty: data.qty,
        uom: item.uom,
        refType: "lot",
        refId: lot.id,
        userId: user.id,
      });

      writeAudit({
        actorId: user.id,
        action: "inventory.goods_receipt",
        entity: "lots",
        entityId: lot.id,
        after: { ...data, lotNo },
      });
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Stock Adjustment (admin only) ----------

const adjustmentSchema = z.object({
  itemId: z.coerce.number().min(1, "Item is required"),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
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
