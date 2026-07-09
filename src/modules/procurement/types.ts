import type { InferSelectModel } from "drizzle-orm";
import type { purchaseOrders, purchaseOrderLines } from "@/db/schema";

export type PurchaseOrder = InferSelectModel<typeof purchaseOrders>;
export type PurchaseOrderLine = InferSelectModel<typeof purchaseOrderLines>;

export const PO_STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  partially_received: "Partially Received",
  closed: "Closed",
  cancelled: "Cancelled",
};
