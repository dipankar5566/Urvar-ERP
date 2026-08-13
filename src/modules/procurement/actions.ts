"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { purchaseOrders, purchaseOrderLines } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { writeAudit } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const uomEnum = z.enum(["kg", "ton", "bag", "litre", "nos", "tractor", "roll"]);

const poLineSchema = z.object({
  itemId: z.coerce.number().min(1),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  rate: z.coerce.number().min(0),
});

const poSchema = z.object({
  id: z.coerce.number().optional(),
  vendorId: z.coerce.number().min(1, "Vendor is required"),
  expectedDeliveryDate: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  lines: z.array(poLineSchema).min(1, "Add at least one line"),
});

// Only editable while status='draft' — a draft never has receipts against it,
// so delete+reinsert of lines (same pattern as saveFormula) discards nothing
// that has been received. The writes below are not wrapped in a transaction:
// if the line insert fails after the delete, the PO is left with no lines and
// has to be re-edited.
export async function savePurchaseOrder(payload: {
  id?: number;
  vendorId: number;
  expectedDeliveryDate?: string;
  remarks?: string;
  lines: { itemId: number; qty: number; uom: string; rate: number }[];
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = poSchema.parse(payload);

    if (data.id) {
      const existing = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, data.id)))[0];
      if (!existing) return { ok: false, error: "Purchase order not found" };
      if (existing.status !== "draft") {
        return {
          ok: false,
          error: `Cannot edit a purchase order that is ${existing.status.replace("_", " ")}`,
        };
      }
    }

    let poId: number;
    if (data.id) {
      await db
        .update(purchaseOrders)
        .set({
          vendorId: data.vendorId,
          expectedDeliveryDate: data.expectedDeliveryDate || null,
          remarks: data.remarks,
        })
        .where(eq(purchaseOrders.id, data.id));
      await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, data.id));
      poId = data.id;
    } else {
      const poNo = await nextDocNumber(db, "PUR");
      const row = (
        await db
          .insert(purchaseOrders)
          .values({
            poNo,
            vendorId: data.vendorId,
            expectedDeliveryDate: data.expectedDeliveryDate || null,
            remarks: data.remarks,
            createdBy: user.id,
          })
          .returning()
      )[0];
      poId = row.id;
    }
    await db
      .insert(purchaseOrderLines)
      .values(data.lines.map((l) => ({ poId, itemId: l.itemId, qty: l.qty, uom: l.uom, rate: l.rate })));
    await writeAudit(db, {
      actorId: user.id,
      action: data.id ? "purchase_order.update" : "purchase_order.create",
      entity: "purchase_orders",
      entityId: poId,
      after: data,
    });

    revalidatePath("/procurement");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePurchaseOrder(poId: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)))[0];
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "draft") {
      return {
        ok: false,
        error: `Only a draft purchase order can be approved (current status: ${po.status.replace("_", " ")})`,
      };
    }
    await db
      .update(purchaseOrders)
      .set({ status: "approved", approvedBy: admin.id, approvedAt: new Date().toISOString() })
      .where(eq(purchaseOrders.id, poId));
    await writeAudit(db, { actorId: admin.id, action: "purchase_order.approve", entity: "purchase_orders", entityId: poId });
    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Rejects a PO with any receipts against it — cancelling receipt history
// would be a lie about what physically happened. Use closePurchaseOrder for
// a short-received PO you want to stop waiting on instead.
export async function cancelPurchaseOrder(poId: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)))[0];
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "draft" && po.status !== "approved") {
      return {
        ok: false,
        error: `Cannot cancel a purchase order that is ${po.status.replace("_", " ")}`,
      };
    }
    const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
    if (lines.some((l) => l.receivedQty > 1e-9)) {
      return { ok: false, error: "Cannot cancel a purchase order with receipts against it — close it instead" };
    }
    await db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, poId));
    await writeAudit(db, { actorId: admin.id, action: "purchase_order.cancel", entity: "purchase_orders", entityId: poId });
    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Manually force-closes an approved/partially-received PO — accepting a
// short receipt as final rather than waiting for the rest to arrive.
export async function closePurchaseOrder(poId: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)))[0];
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "approved" && po.status !== "partially_received") {
      return {
        ok: false,
        error: `Cannot close a purchase order that is ${po.status.replace("_", " ")}`,
      };
    }
    await db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, poId));
    await writeAudit(db, { actorId: admin.id, action: "purchase_order.close", entity: "purchase_orders", entityId: poId });
    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
