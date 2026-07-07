"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { lots, batches, batchTestResults, capas } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { atomic, writeAudit } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ---------- Incoming Raw Material Inspection ----------

const inspectionSchema = z.object({
  lotId: z.coerce.number().min(1),
  moisturePct: z.coerce.number().min(0).max(100).optional(),
  foreignMatterPct: z.coerce.number().min(0).max(100).optional(),
  odour: z.enum(["normal", "off"]).optional(),
  visualCondition: z.enum(["good", "fair", "poor"]).optional(),
  result: z.enum(["accepted", "rejected"]),
  inspectionRemarks: z.string().trim().optional(),
});

export async function recordLotInspection(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["moisturePct", "foreignMatterPct", "odour", "visualCondition"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = inspectionSchema.parse(raw);

    const lot = db.select().from(lots).where(eq(lots.id, data.lotId)).get();
    if (!lot) return { ok: false, error: "Lot not found" };

    atomic(() => {
      db.update(lots)
        .set({
          qcStatus: data.result,
          moisturePct: data.moisturePct,
          foreignMatterPct: data.foreignMatterPct,
          odour: data.odour,
          visualCondition: data.visualCondition,
          inspectionRemarks: data.inspectionRemarks,
          inspectedBy: user.id,
          inspectedAt: new Date().toISOString(),
        })
        .where(eq(lots.id, data.lotId))
        .run();

      writeAudit({
        actorId: user.id,
        action: "quality.lot_inspection",
        entity: "lots",
        entityId: data.lotId,
        after: data,
      });
    });

    revalidatePath("/quality");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Batch QC workflow ----------

function transitionBatch(
  batchId: number,
  from: string[],
  to: "sample_collected" | "testing" | "released" | "hold",
  actorId: number,
  action: string,
  extra?: Record<string, unknown>
) {
  const batch = db.select().from(batches).where(eq(batches.id, batchId)).get();
  if (!batch) throw new Error("Batch not found");
  if (!from.includes(batch.qcStatus)) {
    throw new Error(`Batch is ${batch.qcStatus}, expected ${from.join(" or ")}`);
  }
  db.update(batches).set({ qcStatus: to }).where(eq(batches.id, batchId)).run();
  writeAudit({
    actorId,
    action,
    entity: "batches",
    entityId: batchId,
    before: { qcStatus: batch.qcStatus },
    after: { qcStatus: to, ...extra },
  });
}

export async function collectSample(batchId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    atomic(() =>
      transitionBatch(batchId, ["pending"], "sample_collected", user.id, "quality.collect_sample")
    );
    revalidatePath("/batches");
    revalidatePath(`/batches/${batchId}`);
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function startTesting(batchId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    atomic(() =>
      transitionBatch(
        batchId,
        ["sample_collected", "hold"],
        "testing",
        user.id,
        "quality.start_testing"
      )
    );
    revalidatePath("/batches");
    revalidatePath(`/batches/${batchId}`);
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const testResultSchema = z.object({
  batchId: z.coerce.number().min(1),
  parameter: z.enum([
    "moisture",
    "organic_carbon",
    "nitrogen",
    "phosphorus",
    "potassium",
    "cn_ratio",
    "ph",
    "ec",
    "bulk_density",
    "particle_size",
    "appearance",
    "odour",
    "other",
  ]),
  value: z.coerce.number().optional(),
  textValue: z.string().trim().optional(),
  unit: z.string().trim().optional(),
});

export async function recordTestResult(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    if (raw.value === "") delete raw.value;
    const data = testResultSchema.parse(raw);

    const batch = db.select().from(batches).where(eq(batches.id, data.batchId)).get();
    if (!batch) return { ok: false, error: "Batch not found" };
    if (batch.qcStatus !== "testing") {
      return { ok: false, error: `Batch is ${batch.qcStatus}, expected testing` };
    }
    if (data.value === undefined && !data.textValue) {
      return { ok: false, error: "Enter a value" };
    }

    atomic(() => {
      db.insert(batchTestResults)
        .values({
          batchId: data.batchId,
          parameter: data.parameter,
          value: data.value,
          textValue: data.textValue,
          unit: data.unit,
          recordedBy: user.id,
        })
        .run();
      writeAudit({
        actorId: user.id,
        action: "quality.record_test_result",
        entity: "batch_test_results",
        entityId: data.batchId,
        after: data,
      });
    });

    revalidatePath(`/batches/${data.batchId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function releaseBatch(batchId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const resultCount = db
      .select({ n: sql<number>`count(*)` })
      .from(batchTestResults)
      .where(eq(batchTestResults.batchId, batchId))
      .get()!.n;
    if (resultCount === 0) {
      return { ok: false, error: "Record at least one test result before releasing" };
    }
    atomic(() =>
      transitionBatch(batchId, ["testing"], "released", user.id, "quality.release_batch")
    );
    revalidatePath("/batches");
    revalidatePath(`/batches/${batchId}`);
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const holdSchema = z.object({
  batchId: z.coerce.number().min(1),
  reason: z.string().trim().min(5, "A reason is required (min 5 characters)"),
});

export async function holdBatch(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = holdSchema.parse(Object.fromEntries(formData));
    atomic(() =>
      transitionBatch(
        data.batchId,
        ["pending", "sample_collected", "testing"],
        "hold",
        user.id,
        "quality.hold_batch",
        { reason: data.reason }
      )
    );
    revalidatePath("/batches");
    revalidatePath(`/batches/${data.batchId}`);
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function retestBatch(batchId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    atomic(() =>
      transitionBatch(batchId, ["hold"], "testing", user.id, "quality.retest_batch")
    );
    revalidatePath("/batches");
    revalidatePath(`/batches/${batchId}`);
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- CAPA ----------

const capaSchema = z.object({
  issue: z.string().trim().min(1, "Issue is required"),
  linkedBatchId: z.coerce.number().min(1).optional(),
  linkedLotId: z.coerce.number().min(1).optional(),
  responsibleUserId: z.coerce.number().min(1).optional(),
  deadline: z.string().optional(),
});

export async function createCapa(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["linkedBatchId", "linkedLotId", "responsibleUserId", "deadline"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = capaSchema.parse(raw);

    atomic(() => {
      const capaNo = nextDocNumber("CAPA");
      const capa = db
        .insert(capas)
        .values({
          capaNo,
          issue: data.issue,
          linkedBatchId: data.linkedBatchId,
          linkedLotId: data.linkedLotId,
          responsibleUserId: data.responsibleUserId,
          deadline: data.deadline,
          createdBy: user.id,
        })
        .returning()
        .get();
      writeAudit({
        actorId: user.id,
        action: "quality.create_capa",
        entity: "capas",
        entityId: capa.id,
        after: { capaNo, ...data },
      });
    });

    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const updateCapaSchema = z.object({
  capaId: z.coerce.number().min(1),
  rootCause: z.string().trim().optional(),
  correctiveAction: z.string().trim().optional(),
  preventiveAction: z.string().trim().optional(),
  responsibleUserId: z.coerce.number().min(1).optional(),
  deadline: z.string().optional(),
  status: z.enum(["open", "in_progress", "verification", "closed"]),
});

export async function updateCapa(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = Object.fromEntries(formData);
    for (const k of ["responsibleUserId", "deadline"]) {
      if (raw[k] === "") delete raw[k];
    }
    const data = updateCapaSchema.parse(raw);

    const capa = db.select().from(capas).where(eq(capas.id, data.capaId)).get();
    if (!capa) return { ok: false, error: "CAPA not found" };

    atomic(() => {
      db.update(capas)
        .set({
          rootCause: data.rootCause,
          correctiveAction: data.correctiveAction,
          preventiveAction: data.preventiveAction,
          responsibleUserId: data.responsibleUserId,
          deadline: data.deadline,
          status: data.status,
        })
        .where(eq(capas.id, data.capaId))
        .run();
      writeAudit({
        actorId: user.id,
        action: "quality.update_capa",
        entity: "capas",
        entityId: data.capaId,
        before: capa,
        after: data,
      });
    });

    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const closeCapaSchema = z.object({
  capaId: z.coerce.number().min(1),
  verificationNotes: z.string().trim().min(5, "Verification notes are required"),
});

export async function closeCapa(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = closeCapaSchema.parse(Object.fromEntries(formData));

    const capa = db.select().from(capas).where(eq(capas.id, data.capaId)).get();
    if (!capa) return { ok: false, error: "CAPA not found" };
    if (capa.status === "closed") return { ok: false, error: "CAPA is already closed" };

    atomic(() => {
      db.update(capas)
        .set({
          status: "closed",
          verificationNotes: data.verificationNotes,
          closedAt: new Date().toISOString(),
        })
        .where(eq(capas.id, data.capaId))
        .run();
      writeAudit({
        actorId: user.id,
        action: "quality.close_capa",
        entity: "capas",
        entityId: data.capaId,
        after: data,
      });
    });

    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
