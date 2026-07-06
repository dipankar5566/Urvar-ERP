"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  products,
  items,
  warehouses,
  formulas,
  formulaLines,
  workflowTemplates,
  workflowTemplateStages,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { atomic, writeAudit } from "@/lib/ledger";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const uomEnum = z.enum(["kg", "ton", "bag", "litre", "nos"]);

// ---------- Products ----------

const productSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().min(1, "Code is required").max(6).toUpperCase(),
  hsn: z.string().trim().optional(),
  shelfLifeMonths: z.coerce.number().int().min(1).max(60),
});

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = productSchema.parse(Object.fromEntries(formData));
    atomic(() => {
      if (data.id) {
        db.update(products)
          .set({ name: data.name, code: data.code, hsn: data.hsn, shelfLifeMonths: data.shelfLifeMonths })
          .where(eq(products.id, data.id))
          .run();
        writeAudit({ actorId: admin.id, action: "product.update", entity: "products", entityId: data.id, after: data });
      } else {
        const row = db
          .insert(products)
          .values({ name: data.name, code: data.code, hsn: data.hsn, shelfLifeMonths: data.shelfLifeMonths })
          .returning()
          .get();
        writeAudit({ actorId: admin.id, action: "product.create", entity: "products", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Items ----------

const itemSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(["raw_material", "packing_material", "finished_good", "consumable", "scrap"]),
  uom: uomEnum,
  productId: z.coerce.number().optional(),
  reorderLevel: z.coerce.number().min(0).default(0),
});

export async function saveItem(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const raw = Object.fromEntries(formData);
    if (raw.productId === "") delete raw.productId;
    const data = itemSchema.parse(raw);
    atomic(() => {
      const values = {
        name: data.name,
        category: data.category,
        uom: data.uom,
        productId: data.category === "finished_good" ? data.productId ?? null : null,
        reorderLevel: data.reorderLevel,
      };
      if (data.id) {
        db.update(items).set(values).where(eq(items.id, data.id)).run();
        writeAudit({ actorId: admin.id, action: "item.update", entity: "items", entityId: data.id, after: data });
      } else {
        const row = db.insert(items).values(values).returning().get();
        writeAudit({ actorId: admin.id, action: "item.create", entity: "items", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Warehouses ----------

const warehouseSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  location: z.string().trim().optional(),
});

export async function saveWarehouse(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = warehouseSchema.parse(Object.fromEntries(formData));
    atomic(() => {
      if (data.id) {
        db.update(warehouses).set({ name: data.name, location: data.location }).where(eq(warehouses.id, data.id)).run();
        writeAudit({ actorId: admin.id, action: "warehouse.update", entity: "warehouses", entityId: data.id, after: data });
      } else {
        const row = db.insert(warehouses).values({ name: data.name, location: data.location }).returning().get();
        writeAudit({ actorId: admin.id, action: "warehouse.create", entity: "warehouses", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Users ----------

const userSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  password: z.string().optional(),
  role: z.enum(["admin", "supervisor"]),
  active: z.coerce.boolean().default(true),
});

export async function saveUser(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const raw = Object.fromEntries(formData);
    raw.active = raw.active === "on" || raw.active === "true" ? "true" : "";
    const data = userSchema.parse(raw);

    if (!data.id && (!data.password || data.password.length < 6)) {
      return { ok: false, error: "Password must be at least 6 characters" };
    }
    const passwordHash = data.password && data.password.length >= 6 ? await hashPassword(data.password) : undefined;

    atomic(() => {
      if (data.id) {
        db.update(users)
          .set({
            name: data.name,
            username: data.username,
            role: data.role,
            active: data.active,
            ...(passwordHash ? { passwordHash } : {}),
          })
          .where(eq(users.id, data.id))
          .run();
        writeAudit({ actorId: admin.id, action: "user.update", entity: "users", entityId: data.id });
      } else {
        const row = db
          .insert(users)
          .values({ name: data.name, username: data.username, role: data.role, active: data.active, passwordHash: passwordHash! })
          .returning()
          .get();
        writeAudit({ actorId: admin.id, action: "user.create", entity: "users", entityId: row.id });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Formulas ----------

const formulaSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  productId: z.coerce.number().min(1, "Product is required"),
  outputQty: z.coerce.number().positive(),
  outputUom: uomEnum,
  lines: z
    .array(z.object({ itemId: z.coerce.number().min(1), qtyPerOutput: z.coerce.number().positive() }))
    .min(1, "Add at least one input line"),
});

export async function saveFormula(payload: {
  id?: number;
  name: string;
  productId: number;
  outputQty: number;
  outputUom: string;
  lines: { itemId: number; qtyPerOutput: number }[];
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = formulaSchema.parse(payload);
    atomic(() => {
      let formulaId: number;
      if (data.id) {
        db.update(formulas)
          .set({ name: data.name, productId: data.productId, outputQty: data.outputQty, outputUom: data.outputUom })
          .where(eq(formulas.id, data.id))
          .run();
        db.delete(formulaLines).where(eq(formulaLines.formulaId, data.id)).run();
        formulaId = data.id;
      } else {
        const row = db
          .insert(formulas)
          .values({ name: data.name, productId: data.productId, outputQty: data.outputQty, outputUom: data.outputUom })
          .returning()
          .get();
        formulaId = row.id;
      }
      db.insert(formulaLines)
        .values(data.lines.map((l) => ({ formulaId, itemId: l.itemId, qtyPerOutput: l.qtyPerOutput })))
        .run();
      writeAudit({
        actorId: admin.id,
        action: data.id ? "formula.update" : "formula.create",
        entity: "formulas",
        entityId: formulaId,
        after: data,
      });
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Workflow templates ----------

const templateSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  productId: z.coerce.number().optional(),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        expectedDays: z.coerce.number().int().min(0).optional(),
        requiresReadings: z.boolean().default(false),
      })
    )
    .min(1, "Add at least one stage"),
});

export async function saveWorkflowTemplate(payload: {
  id?: number;
  name: string;
  productId?: number;
  stages: { name: string; expectedDays?: number; requiresReadings: boolean }[];
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = templateSchema.parse(payload);
    atomic(() => {
      let templateId: number;
      if (data.id) {
        db.update(workflowTemplates)
          .set({ name: data.name, productId: data.productId ?? null })
          .where(eq(workflowTemplates.id, data.id))
          .run();
        db.delete(workflowTemplateStages).where(eq(workflowTemplateStages.templateId, data.id)).run();
        templateId = data.id;
      } else {
        const row = db
          .insert(workflowTemplates)
          .values({ name: data.name, productId: data.productId ?? null })
          .returning()
          .get();
        templateId = row.id;
      }
      db.insert(workflowTemplateStages)
        .values(
          data.stages.map((s, i) => ({
            templateId,
            seq: i + 1,
            name: s.name,
            expectedDays: s.expectedDays ?? null,
            requiresReadings: s.requiresReadings,
          }))
        )
        .run();
      writeAudit({
        actorId: admin.id,
        action: data.id ? "workflow_template.update" : "workflow_template.create",
        entity: "workflow_templates",
        entityId: templateId,
        after: data,
      });
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
