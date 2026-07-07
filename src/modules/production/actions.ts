"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/db";
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
  stockBalances,
  lots,
  orderBeds,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { atomic, postTransaction, writeAudit } from "@/lib/ledger";
import { nextDocNumber, nextBatchNumber } from "@/lib/numbering";
import { localDateISO } from "@/lib/dates";
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

    const formula = db.select().from(formulas).where(eq(formulas.id, data.formulaId)).get();
    if (!formula || formula.productId !== data.productId) {
      return { ok: false, error: "Formula does not belong to the selected product" };
    }

    atomic(() => {
      const orderNo = nextDocNumber("PO");
      const order = db
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
        .get();

      // Instantiate stages from the template
      const templateStages = db
        .select()
        .from(workflowTemplateStages)
        .where(eq(workflowTemplateStages.templateId, data.templateId))
        .orderBy(asc(workflowTemplateStages.seq))
        .all();
      if (templateStages.length === 0) throw new Error("Selected workflow has no stages");

      db.insert(orderStages)
        .values(
          templateStages.map((s) => ({
            orderId: order.id,
            seq: s.seq,
            name: s.name,
            requiresReadings: s.requiresReadings,
          }))
        )
        .run();

      writeAudit({
        actorId: user.id,
        action: "production_order.create",
        entity: "production_orders",
        entityId: order.id,
        after: { orderNo, ...data },
      });
    });

    revalidatePath("/production");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Start order: FIFO raw material issue ----------

export async function startProductionOrder(orderId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();

    atomic(() => {
      const order = db.select().from(productionOrders).where(eq(productionOrders.id, orderId)).get();
      if (!order) throw new Error("Order not found");
      if (order.status !== "draft") throw new Error(`Order is ${order.status}, expected draft`);

      const formula = db.select().from(formulas).where(eq(formulas.id, order.formulaId)).get()!;
      const lines = db.select().from(formulaLines).where(eq(formulaLines.formulaId, formula.id)).all();
      const multiplier = order.targetQty / formula.outputQty;

      for (const line of lines) {
        const item = db.select().from(items).where(eq(items.id, line.itemId)).get()!;
        let remaining = line.qtyPerOutput * multiplier;

        // FIFO across lots with stock in this warehouse
        const lotRows = db
          .select({
            lotId: lots.id,
            qty: stockBalances.qty,
          })
          .from(stockBalances)
          .innerJoin(lots, eq(stockBalances.lotId, lots.id))
          .where(
            and(
              eq(stockBalances.itemId, line.itemId),
              eq(stockBalances.warehouseId, order.warehouseId),
              sql`${stockBalances.qty} > 1e-9`
            )
          )
          .orderBy(asc(lots.receivedDate), asc(lots.id))
          .all();

        for (const lotRow of lotRows) {
          if (remaining <= 1e-9) break;
          const take = Math.min(remaining, lotRow.qty);
          postTransaction({
            type: "issue_to_production",
            itemId: line.itemId,
            warehouseId: order.warehouseId,
            lotId: lotRow.lotId,
            qty: -take,
            uom: item.uom,
            refType: "production_order",
            refId: order.id,
            userId: user.id,
          });
          remaining -= take;
        }

        if (remaining > 1e-9) {
          // Also check non-lot stock (from adjustments)
          const looseBalance = db
            .select()
            .from(stockBalances)
            .where(
              and(
                eq(stockBalances.itemId, line.itemId),
                eq(stockBalances.warehouseId, order.warehouseId),
                sql`${stockBalances.lotId} IS NULL`,
                sql`${stockBalances.qty} > 1e-9`
              )
            )
            .get();
          if (looseBalance) {
            const take = Math.min(remaining, looseBalance.qty);
            postTransaction({
              type: "issue_to_production",
              itemId: line.itemId,
              warehouseId: order.warehouseId,
              qty: -take,
              uom: item.uom,
              refType: "production_order",
              refId: order.id,
              userId: user.id,
            });
            remaining -= take;
          }
        }

        if (remaining > 1e-9) {
          throw new Error(
            `Insufficient stock of "${item.name}": short by ${Number(remaining.toFixed(3))} ${item.uom}`
          );
        }
      }

      // Start the order and its first stage
      db.update(productionOrders)
        .set({ status: "in_progress", startedAt: new Date().toISOString() })
        .where(eq(productionOrders.id, orderId))
        .run();

      const firstStage = db
        .select()
        .from(orderStages)
        .where(eq(orderStages.orderId, orderId))
        .orderBy(asc(orderStages.seq))
        .get();
      if (firstStage) {
        db.update(orderStages)
          .set({ status: "in_progress", startedAt: new Date().toISOString(), doneBy: user.id })
          .where(eq(orderStages.id, firstStage.id))
          .run();
      }

      writeAudit({
        actorId: user.id,
        action: "production_order.start",
        entity: "production_orders",
        entityId: orderId,
      });
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

    atomic(() => {
      const stage = db.select().from(orderStages).where(eq(orderStages.id, stageId)).get();
      if (!stage) throw new Error("Stage not found");
      if (stage.status !== "in_progress") throw new Error("Stage is not in progress");

      db.update(orderStages)
        .set({
          status: "completed",
          completedAt: new Date().toISOString(),
          doneBy: user.id,
          notes: notes || stage.notes,
        })
        .where(eq(orderStages.id, stageId))
        .run();

      // Start the next stage if any
      const next = db
        .select()
        .from(orderStages)
        .where(and(eq(orderStages.orderId, stage.orderId), sql`${orderStages.seq} > ${stage.seq}`))
        .orderBy(asc(orderStages.seq))
        .get();
      if (next) {
        db.update(orderStages)
          .set({ status: "in_progress", startedAt: new Date().toISOString() })
          .where(eq(orderStages.id, next.id))
          .run();
      }

      writeAudit({
        actorId: user.id,
        action: "production_order.stage_complete",
        entity: "order_stages",
        entityId: stageId,
        after: { name: stage.name },
      });
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
});

export async function recordReading(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    if (raw.bedId === "") delete raw.bedId;
    const data = readingSchema.parse(raw);

    const stage = db.select().from(orderStages).where(eq(orderStages.id, data.stageId)).get();
    if (!stage) return { ok: false, error: "Stage not found" };

    // If the order has beds assigned, the reading must name which one.
    const assignedBedIds = db
      .select({ bedId: orderBeds.bedId })
      .from(orderBeds)
      .where(eq(orderBeds.orderId, stage.orderId))
      .all()
      .map((r) => r.bedId);

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

    atomic(() => {
      db.insert(stageReadings)
        .values({
          orderStageId: data.stageId,
          bedId: assignedBedIds.length > 0 ? data.bedId : null,
          parameter: data.parameter,
          value: data.value,
          unit: data.unit || defaultUnits[data.parameter] || null,
          notes: data.notes,
          recordedBy: user.id,
        })
        .run();
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
});

export async function completeProductionOrder(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = completeSchema.parse(Object.fromEntries(formData));

    atomic(() => {
      const order = db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, data.orderId))
        .get();
      if (!order) throw new Error("Order not found");
      if (order.status !== "in_progress") throw new Error(`Order is ${order.status}, expected in progress`);

      const product = db.select().from(products).where(eq(products.id, order.productId)).get()!;

      // Finished-good item for this product
      const fgItem = db
        .select()
        .from(items)
        .where(and(eq(items.productId, product.id), eq(items.category, "finished_good")))
        .get();
      if (!fgItem) {
        throw new Error(
          `No finished-good item linked to product "${product.name}". Add one in Masters → Items.`
        );
      }

      // Batch numbers + dates
      const now = new Date();
      const mfgDate = localDateISO(now);
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + product.shelfLifeMonths);
      const expiryDate = localDateISO(expiry);

      const batchNo = nextBatchNumber(product.code, now);
      const yieldPct = (data.actualQty / order.targetQty) * 100;

      const batch = db
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
        })
        .returning()
        .get();

      // Traceability: everything issued to this order becomes a batch input
      const issued = sqlite
        .prepare(
          `SELECT item_id as itemId, lot_id as lotId, sum(qty) as qty, uom
           FROM inventory_transactions
           WHERE type = 'issue_to_production' AND ref_type = 'production_order' AND ref_id = ?
           GROUP BY item_id, lot_id`
        )
        .all(order.id) as { itemId: number; lotId: number | null; qty: number; uom: string }[];

      const inputRows = issued
        .filter((i) => i.lotId !== null)
        .map((i) => ({
          batchId: batch.id,
          lotId: i.lotId!,
          itemId: i.itemId,
          qtyConsumed: -i.qty,
          uom: i.uom as "kg" | "ton" | "bag" | "litre" | "nos",
        }));
      if (inputRows.length > 0) {
        db.insert(batchInputs).values(inputRows).run();
      }

      // Finished goods into stock, tied to the batch
      postTransaction({
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
      db.update(orderStages)
        .set({ status: "completed", completedAt: now.toISOString() })
        .where(and(eq(orderStages.orderId, order.id), sql`status IN ('pending','in_progress')`))
        .run();

      db.update(productionOrders)
        .set({ status: "completed", completedAt: now.toISOString() })
        .where(eq(productionOrders.id, order.id))
        .run();

      writeAudit({
        actorId: user.id,
        action: "production_order.complete",
        entity: "production_orders",
        entityId: order.id,
        after: { batchNo, actualQty: data.actualQty, yieldPct },
      });
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
    atomic(() => {
      const order = db.select().from(productionOrders).where(eq(productionOrders.id, orderId)).get();
      if (!order) throw new Error("Order not found");
      if (order.status !== "draft") throw new Error("Only draft orders can be cancelled");
      db.update(productionOrders)
        .set({ status: "cancelled" })
        .where(eq(productionOrders.id, orderId))
        .run();
      writeAudit({
        actorId: user.id,
        action: "production_order.cancel",
        entity: "production_orders",
        entityId: orderId,
      });
    });
    revalidatePath("/production");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
