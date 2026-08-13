import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
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
import { getSessionUser } from "@/lib/session";
import { MastersView } from "./masters-view";

export default async function MastersPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const [
    productRows,
    itemRows,
    warehouseRows,
    zoneRows,
    vendorRows,
    formulaRows,
    formulaLineRows,
    templateRows,
    stageRows,
    userRows,
  ] = await Promise.all([
    db.select().from(products).orderBy(asc(products.name)),
    db.select().from(items).orderBy(asc(items.name)),
    db.select().from(warehouses).orderBy(asc(warehouses.name)),
    db.select().from(warehouseZones).orderBy(asc(warehouseZones.name)),
    db.select().from(vendors).orderBy(asc(vendors.name)),
    db.select().from(formulas).orderBy(asc(formulas.name)),
    db.select().from(formulaLines),
    db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.name)),
    db.select().from(workflowTemplateStages).orderBy(asc(workflowTemplateStages.seq)),
    db.select().from(users).orderBy(asc(users.name)),
  ]);

  return (
    <MastersView
      products={productRows}
      items={itemRows}
      warehouses={warehouseRows}
      zones={zoneRows}
      vendors={vendorRows}
      formulas={formulaRows}
      formulaLines={formulaLineRows}
      templates={templateRows}
      templateStages={stageRows}
      users={userRows.map(({ passwordHash: _ph, ...u }) => u)}
    />
  );
}
