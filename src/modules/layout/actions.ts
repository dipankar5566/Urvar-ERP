"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  orderBeds,
  productionOrders,
  beds,
  bedMaintenanceLog,
  items,
  zones,
  siteFeatures,
  warehouses,
} from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { atomic, postTransaction, writeAudit } from "@/lib/ledger";
import { pickFifoLots } from "@/lib/fifo";
import type { ActionResult } from "@/modules/masters/actions";
import { computeLayoutVersion } from "./queries";
import { isSelfIntersecting, segmentLength } from "./geometry";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// Replace an order's bed assignment. Beds occupied by another in-progress
// order are rejected.
export async function assignBeds(orderId: number, bedIds: number[]): Promise<ActionResult> {
  try {
    const user = await requireUser();

    await atomic(async (tx) => {
      const order = (await tx.select().from(productionOrders).where(eq(productionOrders.id, orderId)))[0];
      if (!order) throw new Error("Order not found");
      if (order.status === "completed" || order.status === "cancelled") {
        throw new Error(`Cannot assign beds to a ${order.status} order`);
      }

      if (bedIds.length > 0) {
        const conflicts = await tx
          .select({ bedId: orderBeds.bedId, orderNo: productionOrders.orderNo })
          .from(orderBeds)
          .innerJoin(productionOrders, eq(orderBeds.orderId, productionOrders.id))
          .where(
            and(
              inArray(orderBeds.bedId, bedIds),
              eq(productionOrders.status, "in_progress"),
              ne(productionOrders.id, orderId)
            )
          );
        if (conflicts.length > 0) {
          const taken = await tx
            .select({ code: beds.code })
            .from(beds)
            .where(inArray(beds.id, conflicts.map((c) => c.bedId)));
          throw new Error(
            `Bed(s) ${taken.map((t) => t.code).join(", ")} already occupied by ${conflicts[0].orderNo}`
          );
        }
      }

      // Diff against the current assignment rather than delete+reinsert
      // everything, so beds that stay assigned keep their original
      // assignedAt (and therefore an accurate "days in bed" on the map).
      const current = (
        await tx.select({ bedId: orderBeds.bedId }).from(orderBeds).where(eq(orderBeds.orderId, orderId))
      ).map((r) => r.bedId);

      const toRemove = current.filter((id) => !bedIds.includes(id));
      const toAdd = bedIds.filter((id) => !current.includes(id));

      if (toRemove.length > 0) {
        await tx.delete(orderBeds).where(and(eq(orderBeds.orderId, orderId), inArray(orderBeds.bedId, toRemove)));
      }
      if (toAdd.length > 0) {
        await tx.insert(orderBeds).values(toAdd.map((bedId) => ({ orderId, bedId })));
      }

      await writeAudit(tx, {
        actorId: user.id,
        action: "production_order.assign_beds",
        entity: "order_beds",
        entityId: orderId,
        after: { bedIds },
      });
    });

    revalidatePath("/layout-map");
    revalidatePath("/production");
    revalidatePath(`/production/${orderId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

// ---------- Log maintenance ----------

const maintenanceSchema = z.object({
  bedId: z.coerce.number().min(1),
  taskType: z.enum(["watering", "turning", "bio_enzyme"]),
  itemId: z.coerce.number().min(1).optional(),
  qtyApplied: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
});

// Logs a watering/turning/bio-enzyme action against a bed's current
// occupancy. Bio-enzyme also deducts real stock via FIFO — same discipline
// startProductionOrder uses for formula ingredients — so a log entry can
// never exist without the stock actually being moved. Logging ahead of the
// due date is allowed by design; it just resets the rolling schedule.
export async function logBedMaintenance(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    if (raw.itemId === "") delete raw.itemId;
    if (raw.qtyApplied === "") delete raw.qtyApplied;
    const data = maintenanceSchema.parse(raw);

    if (data.taskType === "bio_enzyme") {
      if (!data.itemId) return { ok: false, error: "Select the item applied" };
      if (!data.qtyApplied || data.qtyApplied <= 0) return { ok: false, error: "Enter a quantity applied" };
    }

    await atomic(async (tx) => {
      // Same "occupied" definition getBedLayout() uses — a maintenance log
      // can only attach to a bed the map is actually showing as occupied.
      const ob = (
        await tx
          .select({ id: orderBeds.id, warehouseId: productionOrders.warehouseId })
          .from(orderBeds)
          .innerJoin(productionOrders, eq(orderBeds.orderId, productionOrders.id))
          .where(and(eq(orderBeds.bedId, data.bedId), eq(productionOrders.status, "in_progress")))
      )[0];
      if (!ob) throw new Error("Bed is not currently occupied by an in-progress order");

      const log = (
        await tx
          .insert(bedMaintenanceLog)
          .values({
            orderBedId: ob.id,
            taskType: data.taskType,
            itemId: data.taskType === "bio_enzyme" ? data.itemId : null,
            qtyApplied: data.taskType === "bio_enzyme" ? data.qtyApplied : null,
            notes: data.notes,
            performedBy: user.id,
          })
          .returning()
      )[0];

      if (data.taskType === "bio_enzyme") {
        const item = (await tx.select().from(items).where(eq(items.id, data.itemId!)))[0];
        if (!item) throw new Error("Item not found");

        const picks = await pickFifoLots(tx, data.itemId!, ob.warehouseId, data.qtyApplied!);
        for (const pick of picks) {
          await postTransaction(tx, {
            type: "issue_to_bed_maintenance",
            itemId: data.itemId!,
            warehouseId: ob.warehouseId,
            zoneId: pick.zoneId,
            lotId: pick.lotId,
            qty: -pick.qty,
            uom: item.uom,
            refType: "bed_maintenance_log",
            refId: log.id,
            userId: user.id,
          });
        }
      }

      await writeAudit(tx, {
        actorId: user.id,
        action: "bed.log_maintenance",
        entity: "bed_maintenance_log",
        entityId: log.id,
        after: { bedId: data.bedId, taskType: data.taskType, itemId: data.itemId, qtyApplied: data.qtyApplied },
      });
    });

    revalidatePath("/layout-map");
    revalidatePath("/production");
    revalidatePath("/dashboard");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Layout editing (Phase B) ----------

const ptSchema = z.tuple([z.number().finite(), z.number().finite()]);

const bedUpsertSchema = z.object({
  id: z.number().int().positive().optional(), // absent = new bed
  code: z.string().trim().min(1).max(20),
  zoneId: z.number().int().positive(),
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  widthFt: z.number().min(1).max(50),
});

const structureUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(60),
  structureType: z.enum(["shed", "godown", "tank", "office", "other"]),
  warehouseId: z.number().int().positive().nullable(),
  polygon: z.array(ptSchema).min(3).max(64),
});

const zoneUpsertSchema = z.object({
  id: z.number().int().positive().optional(), // absent = new zone
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(40),
  polygon: z.array(ptSchema).min(3).max(64),
  labelX: z.number().finite(),
  labelY: z.number().finite(),
});

// Polygon reshapes for the boundary / access strip (Phase C vertex editing).
// Only the shape is editable — kind and label stay fixed.
const featureShapeSchema = z.object({
  id: z.number().int().positive(),
  polygon: z.array(ptSchema).min(3).max(128),
});

const saveLayoutSchema = z.object({
  expectedVersion: z.string().min(1),
  beds: z.array(bedUpsertSchema).max(200),
  retireBedIds: z.array(z.number().int().positive()).max(200),
  structures: z.array(structureUpsertSchema).max(100),
  retireStructureIds: z.array(z.number().int().positive()).max(100),
  zones: z.array(zoneUpsertSchema).max(20).default([]),
  featureShapes: z.array(featureShapeSchema).max(10).default([]),
});

export type SaveLayoutPayload = z.input<typeof saveLayoutSchema>;

// Persists one editing session's draft in a single transaction. The editor
// accumulates changes client-side (Cancel = free undo-all); nothing here
// runs per-click. Overlap/outside-zone conditions are deliberately warnings
// in the editor, not rejected here — real sites cheat margins. What IS
// enforced: version conflict, occupied beds can't retire, geometry sanity,
// and only kind='structure' features are touchable (boundary/strip are
// Phase C).
export async function saveLayoutEdits(payload: SaveLayoutPayload): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const data = saveLayoutSchema.parse(payload);

    await atomic(async (tx) => {
      if ((await computeLayoutVersion(tx)) !== data.expectedVersion) {
        throw new Error("The layout was changed by someone else while you were editing — reload and reapply your changes");
      }

      // Self-intersecting ("bowtie") polygons break point-in-polygon and
      // zone auto-detection — hard error, unlike the overlap warnings.
      for (const zn of data.zones) {
        if (isSelfIntersecting(zn.polygon)) throw new Error(`Zone ${zn.code}: polygon crosses itself`);
      }
      for (const fs of data.featureShapes) {
        if (isSelfIntersecting(fs.polygon)) throw new Error("Boundary/strip polygon crosses itself");
      }
      for (const s of data.structures) {
        if (isSelfIntersecting(s.polygon)) throw new Error(`Structure ${s.label}: polygon crosses itself`);
      }

      // --- Zone upserts (first, so new beds may target new zones) ----------
      for (const zn of data.zones) {
        const clash = (
          await tx
            .select({ id: zones.id })
            .from(zones)
            .where(zn.id ? and(eq(zones.code, zn.code), ne(zones.id, zn.id)) : eq(zones.code, zn.code))
        )[0];
        if (clash) throw new Error(`Zone code ${zn.code} is already in use`);
        const values = {
          code: zn.code,
          name: zn.name,
          polygon: JSON.stringify(zn.polygon),
          labelX: zn.labelX,
          labelY: zn.labelY,
        };
        if (zn.id) {
          const existing = (await tx.select().from(zones).where(eq(zones.id, zn.id)))[0];
          if (!existing || !existing.active) throw new Error(`Zone ${zn.code}: not found`);
          await tx.update(zones).set(values).where(eq(zones.id, zn.id));
        } else {
          await tx.insert(zones).values(values);
        }
      }

      // --- Boundary / strip reshapes ----------------------------------------
      for (const fs of data.featureShapes) {
        const existing = (await tx.select().from(siteFeatures).where(eq(siteFeatures.id, fs.id)))[0];
        if (!existing || (existing.kind !== "boundary" && existing.kind !== "strip")) {
          throw new Error("Only the plot boundary and access strip can be reshaped here");
        }
        await tx.update(siteFeatures).set({ polygon: JSON.stringify(fs.polygon) }).where(eq(siteFeatures.id, fs.id));
      }

      // --- Retire beds (never delete: history must survive) ---------------
      if (data.retireBedIds.length > 0) {
        const occupied = await tx
          .select({ bedId: orderBeds.bedId, code: beds.code, orderNo: productionOrders.orderNo })
          .from(orderBeds)
          .innerJoin(productionOrders, eq(orderBeds.orderId, productionOrders.id))
          .innerJoin(beds, eq(orderBeds.bedId, beds.id))
          .where(and(inArray(orderBeds.bedId, data.retireBedIds), eq(productionOrders.status, "in_progress")));
        if (occupied.length > 0) {
          throw new Error(
            `Cannot retire occupied bed(s): ${occupied.map((o) => `${o.code} (${o.orderNo})`).join(", ")}`
          );
        }
        await tx.update(beds).set({ active: false }).where(inArray(beds.id, data.retireBedIds));
      }

      // --- Bed upserts -----------------------------------------------------
      const zoneRows = await tx.select().from(zones).where(eq(zones.active, true));
      const zoneIds = new Set(zoneRows.map((zn) => zn.id));
      for (const b of data.beds) {
        if (!zoneIds.has(b.zoneId)) throw new Error(`Bed ${b.code}: zone not found`);
        // Length is derived from the endpoints server-side — the client's
        // number is display-only and never trusted.
        const lengthFt = Number(segmentLength(b).toFixed(2));
        if (lengthFt < 2) throw new Error(`Bed ${b.code}: too short (${lengthFt}ft)`);

        const clash = (
          await tx
            .select({ id: beds.id })
            .from(beds)
            .where(b.id ? and(eq(beds.code, b.code), ne(beds.id, b.id)) : eq(beds.code, b.code))
        )[0];
        if (clash) throw new Error(`Bed code ${b.code} is already in use`);

        if (b.id) {
          const existing = (await tx.select().from(beds).where(eq(beds.id, b.id)))[0];
          if (!existing || !existing.active) throw new Error(`Bed ${b.code}: not found or retired`);
          await tx
            .update(beds)
            .set({ code: b.code, zoneId: b.zoneId, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, widthFt: b.widthFt, lengthFt })
            .where(eq(beds.id, b.id));
        } else {
          await tx
            .insert(beds)
            .values({ code: b.code, zoneId: b.zoneId, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, widthFt: b.widthFt, lengthFt });
        }
      }

      // --- Structure upserts -----------------------------------------------
      for (const s of data.structures) {
        if (s.warehouseId != null) {
          const wh = (await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, s.warehouseId)))[0];
          if (!wh) throw new Error(`Structure ${s.label}: warehouse not found`);
        }
        const polygon = JSON.stringify(s.polygon);
        if (s.id) {
          const existing = (await tx.select().from(siteFeatures).where(eq(siteFeatures.id, s.id)))[0];
          if (!existing || existing.kind !== "structure" || !existing.active) {
            throw new Error(`Structure ${s.label}: not found or not editable`);
          }
          await tx
            .update(siteFeatures)
            .set({ label: s.label, structureType: s.structureType, warehouseId: s.warehouseId, polygon })
            .where(eq(siteFeatures.id, s.id));
        } else {
          await tx
            .insert(siteFeatures)
            .values({ kind: "structure", structureType: s.structureType, label: s.label, warehouseId: s.warehouseId, polygon });
        }
      }

      // --- Retire structures -----------------------------------------------
      if (data.retireStructureIds.length > 0) {
        const rows = await tx.select().from(siteFeatures).where(inArray(siteFeatures.id, data.retireStructureIds));
        if (rows.some((r) => r.kind !== "structure")) {
          throw new Error("Only structures can be retired from the editor");
        }
        await tx.update(siteFeatures).set({ active: false }).where(inArray(siteFeatures.id, data.retireStructureIds));
      }

      await writeAudit(tx, {
        actorId: user.id,
        action: "layout.save_edits",
        entity: "site_layout",
        after: {
          bedsUpserted: data.beds.map((b) => b.code),
          bedsRetired: data.retireBedIds,
          structuresUpserted: data.structures.map((s) => s.label),
          structuresRetired: data.retireStructureIds,
          zonesUpserted: data.zones.map((zn) => zn.code),
          featureShapesUpdated: data.featureShapes.map((fs) => fs.id),
        },
      });
    });

    revalidatePath("/layout-map");
    revalidatePath("/production");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
