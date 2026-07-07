import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  inventoryTransactions,
  stockBalances,
  items,
  warehouses,
  lots,
  batches,
  users,
} from "@/db/schema";

// Total stock per item per warehouse (sums across lots/batches)
export function getStockOverview() {
  return db
    .select({
      itemId: items.id,
      itemName: items.name,
      category: items.category,
      uom: items.uom,
      reorderLevel: items.reorderLevel,
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
      qty: sql<number>`sum(${stockBalances.qty})`.as("qty"),
    })
    .from(stockBalances)
    .innerJoin(items, eq(stockBalances.itemId, items.id))
    .innerJoin(warehouses, eq(stockBalances.warehouseId, warehouses.id))
    .groupBy(items.id, warehouses.id)
    .having(sql`abs(sum(${stockBalances.qty})) > 1e-9`)
    .all();
}

export function getRecentTransactions(limit = 200) {
  return db
    .select({
      id: inventoryTransactions.id,
      type: inventoryTransactions.type,
      qty: inventoryTransactions.qty,
      uom: inventoryTransactions.uom,
      reason: inventoryTransactions.reason,
      createdAt: inventoryTransactions.createdAt,
      itemName: items.name,
      warehouseName: warehouses.name,
      lotNo: lots.lotNo,
      batchNo: batches.batchNo,
      userName: users.name,
    })
    .from(inventoryTransactions)
    .innerJoin(items, eq(inventoryTransactions.itemId, items.id))
    .innerJoin(warehouses, eq(inventoryTransactions.warehouseId, warehouses.id))
    .leftJoin(lots, eq(inventoryTransactions.lotId, lots.id))
    .leftJoin(batches, eq(inventoryTransactions.batchId, batches.id))
    .innerJoin(users, eq(inventoryTransactions.createdBy, users.id))
    .orderBy(desc(inventoryTransactions.id))
    .limit(limit)
    .all();
}

// Lots with remaining stock for an item (FIFO order) — used by production issue
export function getAvailableLots(itemId: number, warehouseId: number) {
  return db
    .select({
      lotId: lots.id,
      lotNo: lots.lotNo,
      receivedDate: lots.receivedDate,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .innerJoin(lots, eq(stockBalances.lotId, lots.id))
    .where(
      sql`${stockBalances.itemId} = ${itemId} AND ${stockBalances.warehouseId} = ${warehouseId} AND ${stockBalances.qty} > 1e-9`
    )
    .orderBy(lots.receivedDate, lots.id)
    .all();
}

// All batches with remaining stock, across every item/warehouse — used by
// the stock-adjustment dialog's batch picker (QC dispatch gate). Filtered
// client-side to the currently selected item+warehouse; small enough scale
// (one plant, dozens of live batches) that bulk-loading beats a round trip
// per item selection, matching how items/warehouses are already loaded.
export function getAvailableBatches() {
  return db
    .select({
      batchId: batches.id,
      batchNo: batches.batchNo,
      qcStatus: batches.qcStatus,
      itemId: stockBalances.itemId,
      warehouseId: stockBalances.warehouseId,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .innerJoin(batches, eq(stockBalances.batchId, batches.id))
    .where(sql`${stockBalances.qty} > 1e-9`)
    .orderBy(batches.mfgDate, batches.id)
    .all();
}

export type StockRow = ReturnType<typeof getStockOverview>[number];
export type TransactionRow = ReturnType<typeof getRecentTransactions>[number];
export type AvailableBatchRow = ReturnType<typeof getAvailableBatches>[number];
