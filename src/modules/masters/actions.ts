"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  products,
  items,
  warehouses,
  warehouseZones,
  vendors,
  formulas,
  formulaLines,
  workflowTemplates,
  workflowTemplateStages,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { atomic, writeAudit } from "@/lib/ledger";

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const uomEnum = z.enum(["kg", "ton", "bag", "litre", "nos", "tractor", "roll"]);

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
    await atomic(async (tx) => {
      if (data.id) {
        await tx
          .update(products)
          .set({ name: data.name, code: data.code, hsn: data.hsn, shelfLifeMonths: data.shelfLifeMonths })
          .where(eq(products.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "product.update", entity: "products", entityId: data.id, after: data });
      } else {
        const row = (
          await tx
            .insert(products)
            .values({ name: data.name, code: data.code, hsn: data.hsn, shelfLifeMonths: data.shelfLifeMonths })
            .returning()
        )[0];
        await writeAudit(tx, { actorId: admin.id, action: "product.create", entity: "products", entityId: row.id, after: data });
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
  remarks: z.string().trim().optional(),
});

export async function saveItem(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const raw = Object.fromEntries(formData);
    if (raw.productId === "") delete raw.productId;
    const data = itemSchema.parse(raw);
    await atomic(async (tx) => {
      const values = {
        name: data.name,
        category: data.category,
        uom: data.uom,
        productId: data.category === "finished_good" ? data.productId ?? null : null,
        reorderLevel: data.reorderLevel,
        remarks: data.remarks || null,
      };
      if (data.id) {
        await tx.update(items).set(values).where(eq(items.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "item.update", entity: "items", entityId: data.id, after: data });
      } else {
        const row = (await tx.insert(items).values(values).returning())[0];
        await writeAudit(tx, { actorId: admin.id, action: "item.create", entity: "items", entityId: row.id, after: data });
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
    await atomic(async (tx) => {
      if (data.id) {
        await tx.update(warehouses).set({ name: data.name, location: data.location }).where(eq(warehouses.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "warehouse.update", entity: "warehouses", entityId: data.id, after: data });
      } else {
        const row = (await tx.insert(warehouses).values({ name: data.name, location: data.location }).returning())[0];
        await writeAudit(tx, { actorId: admin.id, action: "warehouse.create", entity: "warehouses", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Warehouse Zones ----------
// Purely optional sub-locations — a warehouse with none behaves exactly as
// before everywhere else in the app.

const warehouseZoneSchema = z.object({
  id: z.coerce.number().optional(),
  warehouseId: z.coerce.number().min(1, "Warehouse is required"),
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().optional(),
});

export async function saveWarehouseZone(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = warehouseZoneSchema.parse(Object.fromEntries(formData));
    await atomic(async (tx) => {
      if (data.id) {
        await tx
          .update(warehouseZones)
          .set({ name: data.name, code: data.code })
          .where(eq(warehouseZones.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "warehouse_zone.update", entity: "warehouse_zones", entityId: data.id, after: data });
      } else {
        const row = (
          await tx
            .insert(warehouseZones)
            .values({ warehouseId: data.warehouseId, name: data.name, code: data.code })
            .returning()
        )[0];
        await writeAudit(tx, { actorId: admin.id, action: "warehouse_zone.create", entity: "warehouse_zones", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Vendors ----------

const vendorSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1, "Name is required"),
  contactName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export async function saveVendor(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const data = vendorSchema.parse(Object.fromEntries(formData));
    await atomic(async (tx) => {
      const values = {
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        address: data.address,
      };
      if (data.id) {
        await tx.update(vendors).set(values).where(eq(vendors.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "vendor.update", entity: "vendors", entityId: data.id, after: data });
      } else {
        const row = (await tx.insert(vendors).values(values).returning())[0];
        await writeAudit(tx, { actorId: admin.id, action: "vendor.create", entity: "vendors", entityId: row.id, after: data });
      }
    });
    revalidatePath("/masters");
    revalidatePath("/procurement");
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

    await atomic(async (tx) => {
      if (data.id) {
        await tx
          .update(users)
          .set({
            name: data.name,
            username: data.username,
            role: data.role,
            active: data.active,
            ...(passwordHash ? { passwordHash } : {}),
          })
          .where(eq(users.id, data.id));
        await writeAudit(tx, { actorId: admin.id, action: "user.update", entity: "users", entityId: data.id });
      } else {
        const row = (
          await tx
            .insert(users)
            .values({ name: data.name, username: data.username, role: data.role, active: data.active, passwordHash: passwordHash! })
            .returning()
        )[0];
        await writeAudit(tx, { actorId: admin.id, action: "user.create", entity: "users", entityId: row.id });
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
    await atomic(async (tx) => {
      let formulaId: number;
      if (data.id) {
        await tx
          .update(formulas)
          .set({ name: data.name, productId: data.productId, outputQty: data.outputQty, outputUom: data.outputUom })
          .where(eq(formulas.id, data.id));
        await tx.delete(formulaLines).where(eq(formulaLines.formulaId, data.id));
        formulaId = data.id;
      } else {
        const row = (
          await tx
            .insert(formulas)
            .values({ name: data.name, productId: data.productId, outputQty: data.outputQty, outputUom: data.outputUom })
            .returning()
        )[0];
        formulaId = row.id;
      }
      await tx
        .insert(formulaLines)
        .values(data.lines.map((l) => ({ formulaId, itemId: l.itemId, qtyPerOutput: l.qtyPerOutput })));
      await writeAudit(tx, {
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
    await atomic(async (tx) => {
      let templateId: number;
      if (data.id) {
        await tx
          .update(workflowTemplates)
          .set({ name: data.name, productId: data.productId ?? null })
          .where(eq(workflowTemplates.id, data.id));
        await tx.delete(workflowTemplateStages).where(eq(workflowTemplateStages.templateId, data.id));
        templateId = data.id;
      } else {
        const row = (
          await tx
            .insert(workflowTemplates)
            .values({ name: data.name, productId: data.productId ?? null })
            .returning()
        )[0];
        templateId = row.id;
      }
      await tx.insert(workflowTemplateStages).values(
        data.stages.map((s, i) => ({
          templateId,
          seq: i + 1,
          name: s.name,
          expectedDays: s.expectedDays ?? null,
          requiresReadings: s.requiresReadings,
        }))
      );
      await writeAudit(tx, {
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
