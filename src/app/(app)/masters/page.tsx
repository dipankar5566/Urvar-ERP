import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
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
import { getSessionUser } from "@/lib/session";
import { MastersView } from "./masters-view";

export default async function MastersPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const [productRows, itemRows, warehouseRows, formulaRows, formulaLineRows, templateRows, stageRows, userRows] =
    [
      db.select().from(products).orderBy(asc(products.name)).all(),
      db.select().from(items).orderBy(asc(items.name)).all(),
      db.select().from(warehouses).orderBy(asc(warehouses.name)).all(),
      db.select().from(formulas).orderBy(asc(formulas.name)).all(),
      db.select().from(formulaLines).all(),
      db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.name)).all(),
      db.select().from(workflowTemplateStages).orderBy(asc(workflowTemplateStages.seq)).all(),
      db.select().from(users).orderBy(asc(users.name)).all(),
    ];

  return (
    <MastersView
      products={productRows}
      items={itemRows}
      warehouses={warehouseRows}
      formulas={formulaRows}
      formulaLines={formulaLineRows}
      templates={templateRows}
      templateStages={stageRows}
      users={userRows.map(({ passwordHash: _ph, ...u }) => u)}
    />
  );
}
