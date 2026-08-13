// Traces a production order back to the CRM quotation that spawned it (via
// a converted production_requests row) and, when found, writes an
// erp_outbox_events row for the integration service to relay to CRM's
// production-status endpoint. A no-op for ordinary, non-CRM-linked
// production work — a supervisor's normal day never produces extra
// activity here.
import { eq, and } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { productionRequests, erpOutboxEvents } from "@/db/schema";

export type CrmTraceEventType = "production_order_completed" | "batch_released" | "batch_dispatched";

export async function writeCrmTraceEvent(
  tx: DbOrTx,
  orderId: number,
  eventType: CrmTraceEventType,
  detail: Record<string, unknown>
): Promise<void> {
  const req = (
    await tx
      .select({ crmQuotationId: productionRequests.crmQuotationId, crmOrderId: productionRequests.crmOrderId })
      .from(productionRequests)
      .where(and(eq(productionRequests.convertedOrderId, orderId), eq(productionRequests.status, "converted")))
  )[0];
  if (!req) return;

  await tx.insert(erpOutboxEvents).values({
    eventType,
    payload: JSON.stringify({
      crmQuotationId: req.crmQuotationId,
      crmOrderId: req.crmOrderId,
      ...detail,
    }),
  });
}
