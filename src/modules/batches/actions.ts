"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { batches, items, inventoryTransactions } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { atomic, postTransaction, writeAudit } from "@/lib/ledger";
import { writeCrmTraceEvent } from "@/lib/crm-trace";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const dispatchSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  qty: z.coerce.number().positive(),
  remarks: z.string().trim().optional(),
});

// The one place a released, finished-goods batch actually leaves the
// system as a real dispatch (distinct from createAdjustment's generic
// stock-out, which exists for corrections, not sales fulfillment).
// dispatchStatus/dispatched-so-far are derived from the ledger, never
// stored as a redundant counter — same principle stock_balances already
// follows.
export async function markBatchDispatched(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = dispatchSchema.parse(Object.fromEntries(formData));

    await atomic(async (tx) => {
      const batch = (await tx.select().from(batches).where(eq(batches.id, data.batchId)))[0];
      if (!batch) throw new Error("Batch not found");
      if (batch.qcStatus !== "released") {
        throw new Error(`Batch is ${batch.qcStatus}, expected released`);
      }
      if (batch.dispatchStatus === "dispatched") {
        throw new Error("Batch is already fully dispatched");
      }

      const fgItem = (
        await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.productId, batch.productId), eq(items.category, "finished_good")))
      )[0];
      if (!fgItem) throw new Error("No finished-good item linked to this batch's product");

      const dispatchedSoFar = (
        await tx
          .select({ qty: sql<number>`coalesce(sum(-${inventoryTransactions.qty}), 0)` })
          .from(inventoryTransactions)
          .where(
            and(eq(inventoryTransactions.type, "dispatch_out"), eq(inventoryTransactions.batchId, data.batchId))
          )
      )[0].qty;

      const remaining = batch.qtyProduced - dispatchedSoFar;
      if (data.qty > remaining + 1e-9) {
        throw new Error(
          `Cannot dispatch ${data.qty} ${batch.uom} — only ${Number(remaining.toFixed(3))} ${batch.uom} remaining`
        );
      }

      await postTransaction(tx, {
        type: "dispatch_out",
        itemId: fgItem.id,
        warehouseId: batch.warehouseId,
        batchId: batch.id,
        qty: -data.qty,
        uom: batch.uom,
        refType: "batch_dispatch",
        refId: batch.id,
        reason: data.remarks,
        userId: user.id,
      });

      const newDispatched = dispatchedSoFar + data.qty;
      const newStatus = newDispatched >= batch.qtyProduced - 1e-9 ? "dispatched" : "partial";
      await tx.update(batches).set({ dispatchStatus: newStatus }).where(eq(batches.id, batch.id));

      await writeAudit(tx, {
        actorId: user.id,
        action: "batch.dispatch",
        entity: "batches",
        entityId: batch.id,
        after: { qty: data.qty, newStatus, remarks: data.remarks },
      });

      if (newStatus === "dispatched") {
        await writeCrmTraceEvent(tx, batch.orderId, "batch_dispatched", {
          batchNo: batch.batchNo,
          qtyDispatched: newDispatched,
          uom: batch.uom,
        });
      }
    });

    revalidatePath("/batches");
    revalidatePath(`/batches/${data.batchId}`);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
