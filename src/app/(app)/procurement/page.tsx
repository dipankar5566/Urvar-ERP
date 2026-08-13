import { db } from "@/db";
import { items } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import {
  getVendors,
  getPurchaseOrders,
  getAllPurchaseOrderLines,
  getRateHistory,
} from "@/modules/procurement/queries";
import { ProcurementView } from "./procurement-view";

export default async function ProcurementPage() {
  const user = await requireUser();
  const vendors = await getVendors();
  const purchaseOrders = await getPurchaseOrders();
  const lines = await getAllPurchaseOrderLines();
  const rateHistory = await getRateHistory();
  const itemRows = (await db.select().from(items).orderBy(asc(items.name))).filter(
    (i) => i.category !== "finished_good" && i.active
  );

  return (
    <ProcurementView
      user={user}
      vendors={vendors}
      purchaseOrders={purchaseOrders}
      lines={lines}
      rateHistory={rateHistory}
      items={itemRows}
    />
  );
}
