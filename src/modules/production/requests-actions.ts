"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productionRequests } from "@/db/schema";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/modules/masters/actions";

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// Called right after createProductionOrder() succeeds for a request the
// supervisor opened via "Convert" — links the two records. Deliberately
// separate from createProductionOrder itself, which stays exactly as it is
// for every other (non-CRM-originated) order.
export async function convertProductionRequest(requestId: number, orderId: number): Promise<ActionResult> {
  try {
    await requireUser();
    await db
      .update(productionRequests)
      .set({ status: "converted", convertedOrderId: orderId })
      .where(eq(productionRequests.id, requestId));
    revalidatePath("/production-requests");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const dismissSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, "A reason is required (min 5 characters)"),
});

export async function dismissProductionRequest(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser();
    const data = dismissSchema.parse(Object.fromEntries(formData));
    await db
      .update(productionRequests)
      .set({ status: "dismissed", dismissedReason: data.reason })
      .where(eq(productionRequests.id, data.requestId));
    revalidatePath("/production-requests");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
