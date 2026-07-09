import { asc } from "drizzle-orm";
import { db } from "@/db";
import { items, warehouses, warehouseZones } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  getStockOverview,
  getRecentTransactions,
  getAvailableBatches,
  getExpiringBatches,
  getAgingStock,
  getStockTrend,
} from "@/modules/inventory/queries";
import { getOpenPOLines } from "@/modules/procurement/queries";
import { InventoryView } from "./inventory-view";

export default async function InventoryPage() {
  const user = await requireUser();

  const stock = getStockOverview();
  const transactions = getRecentTransactions();
  const itemRows = db.select().from(items).orderBy(asc(items.name)).all();
  const warehouseRows = db.select().from(warehouses).orderBy(asc(warehouses.name)).all();
  const zoneRows = db.select().from(warehouseZones).orderBy(asc(warehouseZones.name)).all();
  const availableBatches = getAvailableBatches();
  const expiring = getExpiringBatches();
  const aging = getAgingStock();
  const openPOLines = getOpenPOLines();

  return (
    <InventoryView
      user={user}
      stock={stock}
      transactions={transactions}
      items={itemRows}
      warehouses={warehouseRows}
      zones={zoneRows}
      availableBatches={availableBatches}
      expiring={expiring}
      aging={aging}
      openPOLines={openPOLines}
      stockTrend={getStockTrend()}
    />
  );
}
