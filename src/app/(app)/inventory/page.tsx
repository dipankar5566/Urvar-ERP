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

  const stock = await getStockOverview();
  const transactions = await getRecentTransactions();
  const itemRows = await db.select().from(items).orderBy(asc(items.name));
  const warehouseRows = await db.select().from(warehouses).orderBy(asc(warehouses.name));
  const zoneRows = await db.select().from(warehouseZones).orderBy(asc(warehouseZones.name));
  const availableBatches = await getAvailableBatches();
  const expiring = await getExpiringBatches();
  const aging = await getAgingStock();
  const openPOLines = await getOpenPOLines();
  const stockTrend = await getStockTrend();

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
      stockTrend={stockTrend}
    />
  );
}
