"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { purchaseOrders, purchaseOrderLines } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { atomic, writeAudit } from "@/lib/ledger";
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
// so delete+reinsert of lines (same pattern as saveFormula) never loses data.
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
      const existing = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, data.id)).get();
      if (!existing) return { ok: false, error: "Purchase order not found" };
      if (existing.status !== "draft") {
        return {
          ok: false,
          error: `Cannot edit a purchase order that is ${existing.status.replace("_", " ")}`,
        };
      }
    }

    atomic(() => {
      let poId: number;
      if (data.id) {
        db.update(purchaseOrders)
          .set({
            vendorId: data.vendorId,
            expectedDeliveryDate: data.expectedDeliveryDate || null,
            remarks: data.remarks,
          })
          .where(eq(purchaseOrders.id, data.id))
          .run();
        db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, data.id)).run();
        poId = data.id;
      } else {
        const poNo = nextDocNumber("PUR");
        const row = db
          .insert(purchaseOrders)
          .values({
            poNo,
            vendorId: data.vendorId,
            expectedDeliveryDate: data.expectedDeliveryDate || null,
            remarks: data.remarks,
            createdBy: user.id,
          })
          .returning()
          .get();
        poId = row.id;
      }
      db.insert(purchaseOrderLines)
        .values(data.lines.map((l) => ({ poId, itemId: l.itemId, qty: l.qty, uom: l.uom, rate: l.rate })))
        .run();
      writeAudit({
        actorId: user.id,
        action: data.id ? "purchase_order.update" : "purchase_order.create",
        entity: "purchase_orders",
        entityId: poId,
        after: data,
      });
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
    const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "draft") {
      return {
        ok: false,
        error: `Only a draft purchase order can be approved (current status: ${po.status.replace("_", " ")})`,
      };
    }
    atomic(() => {
      db.update(purchaseOrders)
        .set({ status: "approved", approvedBy: admin.id, approvedAt: sql`(datetime('now'))` })
        .where(eq(purchaseOrders.id, poId))
        .run();
      writeAudit({ actorId: admin.id, action: "purchase_order.approve", entity: "purchase_orders", entityId: poId });
    });
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
    const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "draft" && po.status !== "approved") {
      return {
        ok: false,
        error: `Cannot cancel a purchase order that is ${po.status.replace("_", " ")}`,
      };
    }
    const lines = db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId)).all();
    if (lines.some((l) => l.receivedQty > 1e-9)) {
      return { ok: false, error: "Cannot cancel a purchase order with receipts against it — close it instead" };
    }
    atomic(() => {
      db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, poId)).run();
      writeAudit({ actorId: admin.id, action: "purchase_order.cancel", entity: "purchase_orders", entityId: poId });
    });
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
    const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status !== "approved" && po.status !== "partially_received") {
      return {
        ok: false,
        error: `Cannot close a purchase order that is ${po.status.replace("_", " ")}`,
      };
    }
    atomic(() => {
      db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, poId)).run();
      writeAudit({ actorId: admin.id, action: "purchase_order.close", entity: "purchase_orders", entityId: poId });
    });
    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
