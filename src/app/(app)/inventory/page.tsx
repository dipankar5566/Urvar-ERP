import { asc } from "drizzle-orm";
import { db } from "@/db";
import { items, warehouses } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getStockOverview, getRecentTransactions } from "@/modules/inventory/queries";
import { InventoryView } from "./inventory-view";

export default async function InventoryPage() {
  const user = await requireUser();

  const stock = getStockOverview();
  const transactions = getRecentTransactions();
  const itemRows = db.select().from(items).orderBy(asc(items.name)).all();
  const warehouseRows = db.select().from(warehouses).orderBy(asc(warehouses.name)).all();

  return (
    <InventoryView
      user={user}
      stock={stock}
      transactions={transactions}
      items={itemRows}
      warehouses={warehouseRows}
    />
  );
}
