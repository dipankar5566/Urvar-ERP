import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionRequests, items } from "@/db/schema";
import { verifyIntegrationRequest } from "@/lib/integration-auth";

// Called by the integration service when a CRM quotation is won — lands a
// staging row for a supervisor to review, not a real production order.
// createProductionOrder() needs formula/template/warehouse/supervisor/shift
// that a sales quotation can't supply, so this deliberately does not call it.
//
// uom is NOT accepted from the caller — CRM has no equivalent structured
// unit field (its Product.unit is free text like "50kg bag" or "1L can",
// not ERP's kg/ton/bag/litre/nos/tractor/roll enum). ERP already knows its
// own product's uom via the linked finished-goods item, so it derives it
// server-side rather than trusting/translating a foreign vocabulary.
const bodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  requestedQty: z.coerce.number().positive(),
  crmQuotationId: z.string().min(1),
  crmOrderId: z.string().optional(),
  crmQuotationNumber: z.string().optional(),
  crmCustomerId: z.string().optional(),
  crmCustomerName: z.string().optional(),
  crmCustomerNumber: z.string().optional(),
});

export async function POST(request: Request) {
  if (!verifyIntegrationRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { productId, ...rest } = parsed.data;

  // Idempotent by (crmQuotationId, productId): if a multi-line quotation
  // partially succeeds here and then the integration service hits a
  // transient failure on a later line, its retry re-runs the whole event
  // from scratch — this must not create a second row for a line already
  // landed. Returns the existing row rather than erroring, so a retry is a
  // no-op for lines already processed.
  const existing = (
    await db
      .select({ id: productionRequests.id })
      .from(productionRequests)
      .where(
        and(eq(productionRequests.crmQuotationId, parsed.data.crmQuotationId), eq(productionRequests.productId, productId))
      )
  )[0];
  if (existing) {
    return NextResponse.json({ id: existing.id }, { status: 200 });
  }

  const fgItem = (
    await db
      .select({ uom: items.uom })
      .from(items)
      .where(and(eq(items.productId, productId), eq(items.category, "finished_good")))
  )[0];
  if (!fgItem) {
    return NextResponse.json(
      { error: `No finished-good item linked to product #${productId}` },
      { status: 422 }
    );
  }

  const [row] = await db
    .insert(productionRequests)
    .values({ productId, uom: fgItem.uom, ...rest })
    .returning();
  return NextResponse.json({ id: row.id }, { status: 201 });
}
