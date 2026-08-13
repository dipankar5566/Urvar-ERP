"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  productionOrders,
  orderStages,
  stageReadings,
  workflowTemplateStages,
  formulas,
  formulaLines,
  products,
  items,
  batches,
  batchInputs,
  orderBeds,
  inventoryTransactions,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { postTransaction, writeAudit } from "@/lib/ledger";
import { nextDocNumber, nextBatchNumber } from "@/lib/numbering";
import { localDateISO } from "@/lib/dates";
import { pickFifoLots } from "@/lib/fifo";
import { writeCrmTraceEvent } from "@/lib/crm-trace";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ---------- Create order ----------

const orderSchema = z.object({
  productId: z.coerce.number().min(1, "Product is required"),
  formulaId: z.coerce.number().min(1, "Formula is required"),
  templateId: z.coerce.number().min(1, "Workflow is required"),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
  targetQty: z.coerce.number().positive("Target quantity must be positive"),
  supervisorId: z.coerce.number().min(1, "Supervisor is required"),
  shift: z.enum(["day", "night", "general"]).default("general"),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  remarks: z.string().trim().optional(),
});

export async function createProductionOrder(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = orderSchema.parse(Object.fromEntries(formData));

    const formula = (await db.select().from(formulas).where(eq(formulas.id, data.formulaId)))[0];
    if (!formula || formula.productId !== data.productId) {
      return { ok: false, error: "Formula does not belong to the selected product" };
    }

    // Checked before the order row is written: without a transaction, a
    // template with no stages would otherwise leave a stage-less order behind.
    const templateStages = await db
      .select()
      .from(workflowTemplateStages)
      .where(eq(workflowTemplateStages.templateId, data.templateId))
      .orderBy(asc(workflowTemplateStages.seq));
    if (templateStages.length === 0) return { ok: false, error: "Selected workflow has no stages" };

    const orderNo = await nextDocNumber(db, "PO");
    const order = (
      await db
        .insert(productionOrders)
        .values({
          orderNo,
          productId: data.productId,
          formulaId: data.formulaId,
          templateId: data.templateId,
          warehouseId: data.warehouseId,
          targetQty: data.targetQty,
          uom: formula.outputUom,
          supervisorId: data.supervisorId,
          shift: data.shift,
          plannedStart: data.plannedStart || null,
          plannedEnd: data.plannedEnd || null,
          remarks: data.remarks,
          createdBy: user.id,
        })
        .returning()
    )[0];

    // Instantiate stages from the template
    await db.insert(orderStages).values(
      templateStages.map((s) => ({
        orderId: order.id,
        seq: s.seq,
        name: s.name,
        requiresReadings: s.requiresReadings,
      }))
    );

    await writeAudit(db, {
      actorId: user.id,
      action: "production_order.create",
      entity: "production_orders",
      entityId: order.id,
      after: { orderNo, ...data },
    });

    const orderId = order.id;

    revalidatePath("/production");
    return { ok: true, id: orderId };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Start order: FIFO raw material issue ----------

export async function startProductionOrder(orderId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const order = (await db.select().from(productionOrders).where(eq(productionOrders.id, orderId)))[0];
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== "draft") return { ok: false, error: `Order is ${order.status}, expected draft` };

    const formula = (await db.select().from(formulas).where(eq(formulas.id, order.formulaId)))[0];
    const lines = await db.select().from(formulaLines).where(eq(formulaLines.formulaId, formula.id));
    const multiplier = order.targetQty / formula.outputQty;

    // Each issue is now committed as it is posted rather than as one unit: a
    // shortage on the third material leaves the first two already issued and
    // the order still in draft. Reverse those with a manual stock adjustment
    // before retrying, or the material is counted as consumed twice.
    for (const line of lines) {
      const item = (await db.select().from(items).where(eq(items.id, line.itemId)))[0];
      const qtyNeeded = line.qtyPerOutput * multiplier;

      // FIFO across lots (rejected lots excluded, pending ones stay
      // usable — see pickFifoLots), falling back to loose stock; throws
      // with a clear shortage error if the item can't be fully covered.
      const picks = await pickFifoLots(db, line.itemId, order.warehouseId, qtyNeeded);
      for (const pick of picks) {
        await postTransaction(db, {
          type: "issue_to_production",
          itemId: line.itemId,
          warehouseId: order.warehouseId,
          zoneId: pick.zoneId,
          lotId: pick.lotId,
          qty: -pick.qty,
          uom: item.uom,
          refType: "production_order",
          refId: order.id,
          userId: user.id,
        });
      }
    }

    // Start the order and its first stage
    await db
      .update(productionOrders)
      .set({ status: "in_progress", startedAt: new Date().toISOString() })
      .where(eq(productionOrders.id, orderId));

    const firstStage = (
      await db
        .select()
        .from(orderStages)
        .where(eq(orderStages.orderId, orderId))
        .orderBy(asc(orderStages.seq))
    )[0];
    if (firstStage) {
      await db
        .update(orderStages)
        .set({ status: "in_progress", startedAt: new Date().toISOString(), doneBy: user.id })
        .where(eq(orderStages.id, firstStage.id));
    }

    await writeAudit(db, {
      actorId: user.id,
      action: "production_order.start",
      entity: "production_orders",
      entityId: orderId,
    });

    revalidatePath("/production");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Advance stage ----------

export async function completeStage(stageId: number, notes?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const stage = (await db.select().from(orderStages).where(eq(orderStages.id, stageId)))[0];
    if (!stage) return { ok: false, error: "Stage not found" };
    if (stage.status !== "in_progress") return { ok: false, error: "Stage is not in progress" };

    await db
      .update(orderStages)
      .set({
        status: "completed",
        completedAt: new Date().toISOString(),
        doneBy: user.id,
        notes: notes || stage.notes,
      })
      .where(eq(orderStages.id, stageId));

    // Start the next stage if any
    const next = (
      await db
        .select()
        .from(orderStages)
        .where(and(eq(orderStages.orderId, stage.orderId), sql`${orderStages.seq} > ${stage.seq}`))
        .orderBy(asc(orderStages.seq))
    )[0];
    if (next) {
      await db
        .update(orderStages)
        .set({ status: "in_progress", startedAt: new Date().toISOString() })
        .where(eq(orderStages.id, next.id));
    }

    await writeAudit(db, {
      actorId: user.id,
      action: "production_order.stage_complete",
      entity: "order_stages",
      entityId: stageId,
      after: { name: stage.name },
    });

    revalidatePath("/production");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Record reading ----------

const readingSchema = z.object({
  stageId: z.coerce.number().min(1),
  bedId: z.coerce.number().min(1).optional(),
  parameter: z.enum(["temperature", "moisture", "ph", "turning", "other"]),
  value: z.coerce.number(),
  unit: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  isDeviation: z.coerce.boolean().default(false),
});

export async function recordReading(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    if (raw.bedId === "") delete raw.bedId;
    raw.isDeviation = raw.isDeviation === "on" || raw.isDeviation === "true" ? "true" : "";
    const data = readingSchema.parse(raw);

    const stage = (await db.select().from(orderStages).where(eq(orderStages.id, data.stageId)))[0];
    if (!stage) return { ok: false, error: "Stage not found" };

    // If the order has beds assigned, the reading must name which one.
    const assignedBedIds = (
      await db.select({ bedId: orderBeds.bedId }).from(orderBeds).where(eq(orderBeds.orderId, stage.orderId))
    ).map((r) => r.bedId);

    if (assignedBedIds.length > 0) {
      if (!data.bedId) {
        return { ok: false, error: "Select which bed this reading is for" };
      }
      if (!assignedBedIds.includes(data.bedId)) {
        return { ok: false, error: "That bed is not assigned to this order" };
      }
    }

    const defaultUnits: Record<string, string> = {
      temperature: "°C",
      moisture: "%",
      ph: "pH",
      turning: "count",
    };

    await db.insert(stageReadings).values({
      orderStageId: data.stageId,
      bedId: assignedBedIds.length > 0 ? data.bedId : null,
      parameter: data.parameter,
      value: data.value,
      unit: data.unit || defaultUnits[data.parameter] || null,
      notes: data.notes,
      isDeviation: data.isDeviation,
      recordedBy: user.id,
    });

    revalidatePath("/production");
    revalidatePath("/layout-map");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Complete order → create batch ----------

const completeSchema = z.object({
  orderId: z.coerce.number().min(1),
  actualQty: z.coerce.number().positive("Actual output must be positive"),
  // Manual lump-sum entries — not traced/calculated like material cost, just
  // recorded against the batch. Both optional; left null if skipped.
  laborCost: z.coerce.number().min(0).optional(),
  overheadCost: z.coerce.number().min(0).optional(),
});

export async function completeProductionOrder(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["laborCost", "overheadCost"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = completeSchema.parse(raw);

    const order = (await db.select().from(productionOrders).where(eq(productionOrders.id, data.orderId)))[0];
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== "in_progress") {
      return { ok: false, error: `Order is ${order.status}, expected in progress` };
    }

    const product = (await db.select().from(products).where(eq(products.id, order.productId)))[0];

    // Finished-good item for this product. Resolved up front — without a
    // transaction, discovering this after the batch row is inserted would
    // leave a batch with no stock behind it.
    const fgItem = (
      await db
        .select()
        .from(items)
        .where(and(eq(items.productId, product.id), eq(items.category, "finished_good")))
    )[0];
    if (!fgItem) {
      return {
        ok: false,
        error: `No finished-good item linked to product "${product.name}". Add one in Masters → Items.`,
      };
    }

    // Batch numbers + dates
    const now = new Date();
    const mfgDate = localDateISO(now);
    const expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + product.shelfLifeMonths);
    const expiryDate = localDateISO(expiry);

    // Not transaction-guarded: two completions racing on the same product and
    // day can now read the same count and collide on batches.batch_no, which
    // is UNIQUE — the second one fails and is retried by the operator.
    const batchNo = await nextBatchNumber(db, product.code, now);
    const yieldPct = (data.actualQty / order.targetQty) * 100;

    const batch = (
      await db
        .insert(batches)
        .values({
          batchNo,
          orderId: order.id,
          productId: product.id,
          mfgDate,
          expiryDate,
          qtyProduced: data.actualQty,
          uom: order.uom,
          expectedQty: order.targetQty,
          yieldPct,
          warehouseId: order.warehouseId,
          laborCost: data.laborCost,
          overheadCost: data.overheadCost,
        })
        .returning()
    )[0];

      // Traceability: everything issued to this order becomes a batch input.
      // uom is added to GROUP BY alongside item/lot (Postgres requires every
      // selected column to be grouped or aggregated, unlike SQLite) — safe
      // since uom is functionally determined by itemId.
    const issued = await db
      .select({
        itemId: inventoryTransactions.itemId,
        lotId: inventoryTransactions.lotId,
        qty: sql<number>`sum(${inventoryTransactions.qty})`,
        uom: inventoryTransactions.uom,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.type, "issue_to_production"),
          eq(inventoryTransactions.refType, "production_order"),
          eq(inventoryTransactions.refId, order.id)
        )
      )
      .groupBy(inventoryTransactions.itemId, inventoryTransactions.lotId, inventoryTransactions.uom);

    const inputRows = issued
      .filter((i) => i.lotId !== null)
      .map((i) => ({
        batchId: batch.id,
        lotId: i.lotId!,
        itemId: i.itemId,
        qtyConsumed: -i.qty,
        uom: i.uom as "kg" | "ton" | "bag" | "litre" | "nos" | "tractor" | "roll",
      }));
    if (inputRows.length > 0) {
      await db.insert(batchInputs).values(inputRows);
    }

    // Finished goods into stock, tied to the batch
    await postTransaction(db, {
      type: "production_output",
      itemId: fgItem.id,
      warehouseId: order.warehouseId,
      batchId: batch.id,
      qty: data.actualQty,
      uom: order.uom,
      refType: "production_order",
      refId: order.id,
      userId: user.id,
    });

    // Close any open stages and the order
    await db
      .update(orderStages)
      .set({ status: "completed", completedAt: now.toISOString() })
      .where(and(eq(orderStages.orderId, order.id), sql`status IN ('pending','in_progress')`));

    await db
      .update(productionOrders)
      .set({ status: "completed", completedAt: now.toISOString() })
      .where(eq(productionOrders.id, order.id));

    await writeAudit(db, {
      actorId: user.id,
      action: "production_order.complete",
      entity: "production_orders",
      entityId: order.id,
      after: { batchNo, actualQty: data.actualQty, yieldPct, laborCost: data.laborCost, overheadCost: data.overheadCost },
    });

    await writeCrmTraceEvent(db, order.id, "production_order_completed", {
      batchNo,
      qtyProduced: data.actualQty,
      yieldPct,
    });

    revalidatePath("/production");
    revalidatePath("/batches");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Cancel draft order ----------

export async function cancelProductionOrder(orderId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const order = (await db.select().from(productionOrders).where(eq(productionOrders.id, orderId)))[0];
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== "draft") return { ok: false, error: "Only draft orders can be cancelled" };
    await db.update(productionOrders).set({ status: "cancelled" }).where(eq(productionOrders.id, orderId));
    await writeAudit(db, {
      actorId: user.id,
      action: "production_order.cancel",
      entity: "production_orders",
      entityId: orderId,
    });
    revalidatePath("/production");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
