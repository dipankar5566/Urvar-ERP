import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, formulas, workflowTemplates, warehouses, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getOrders } from "@/modules/production/queries";
import { ProductionView } from "./production-view";

export default async function ProductionPage() {
  await requireUser();

  const orders = await getOrders();
  const productRows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const formulaRows = await db.select().from(formulas).where(eq(formulas.active, true));
  const templateRows = await db.select().from(workflowTemplates).where(eq(workflowTemplates.active, true));
  const warehouseRows = await db.select().from(warehouses).where(eq(warehouses.active, true));
  const supervisorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));

  return (
    <Suspense>
      <ProductionView
        orders={orders}
        products={productRows}
        formulas={formulaRows}
        templates={templateRows}
        warehouses={warehouseRows}
        supervisors={supervisorRows}
      />
    </Suspense>
  );
}
