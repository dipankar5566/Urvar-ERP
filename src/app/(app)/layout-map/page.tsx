import { asc } from "drizzle-orm";
import { db } from "@/db";
import { items, warehouses } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getBedLayout } from "@/modules/layout/queries";
import { LayoutView } from "./layout-view";

export default async function LayoutPage() {
  const user = await requireUser();
  const layout = getBedLayout();
  const warehouseRows = db.select().from(warehouses).orderBy(asc(warehouses.name)).all();

  // Raw-material items for the bio-enzyme maintenance log's item picker —
  // not locked to a single hardcoded item id so a rename doesn't break it.
  const rawMaterialItems = db
    .select()
    .from(items)
    .orderBy(asc(items.name))
    .all()
    .filter((i) => i.category === "raw_material" && i.active);
  const defaultBioEnzymeItemId =
    rawMaterialItems.find((i) => i.name.toLowerCase().includes("enzyme"))?.id ?? null;

  return (
    <LayoutView
      layout={layout}
      rawMaterialItems={rawMaterialItems}
      defaultBioEnzymeItemId={defaultBioEnzymeItemId}
      canEdit={user.role === "admin"}
      warehouses={warehouseRows}
    />
  );
}
