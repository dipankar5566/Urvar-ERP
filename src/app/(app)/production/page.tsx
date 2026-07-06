import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, formulas, workflowTemplates, warehouses, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getOrders } from "@/modules/production/queries";
import { ProductionView } from "./production-view";

export default async function ProductionPage() {
  await requireUser();

  const orders = getOrders();
  const productRows = db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name)).all();
  const formulaRows = db.select().from(formulas).where(eq(formulas.active, true)).all();
  const templateRows = db.select().from(workflowTemplates).where(eq(workflowTemplates.active, true)).all();
  const warehouseRows = db.select().from(warehouses).where(eq(warehouses.active, true)).all();
  const supervisorRows = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name))
    .all();

  return (
    <ProductionView
      orders={orders}
      products={productRows}
      formulas={formulaRows}
      templates={templateRows}
      warehouses={warehouseRows}
      supervisors={supervisorRows}
    />
  );
}
