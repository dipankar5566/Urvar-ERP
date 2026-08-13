import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  inventoryTransactions,
  stockBalances,
  items,
  warehouses,
  lots,
  batches,
  products,
  users,
} from "@/db/schema";

// Total stock per item per warehouse (sums across lots/batches)
export async function getStockOverview() {
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
    .having(sql`abs(sum(${stockBalances.qty})) > 1e-9`);
}

export async function getRecentTransactions(limit = 200) {
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
    .limit(limit);
}

// Stock level over time per item: opening balance at the window start plus
// daily net movement, for the Trends chart (which shows one item at a time —
// per-item series, never summed across items with different units).
// Dates are truncated in UTC explicitly (AT TIME ZONE 'UTC') rather than
// relying on the connection's session timezone, matching how SQLite's date()
// on a Z-suffixed ISO string always did this implicitly.
export async function getStockTrend(days = 60) {
  const start = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const openingResult = await db.execute(
    sql`SELECT t.item_id as "itemId", i.name as "itemName", i.uom as "uom",
               sum(t.qty) as qty
        FROM inventory_transactions t JOIN items i ON i.id = t.item_id
        WHERE (t.created_at AT TIME ZONE 'UTC')::date < ${start}::date
        GROUP BY t.item_id, i.name, i.uom`
  );
  const opening = openingResult.rows as unknown as { itemId: number; itemName: string; uom: string; qty: number }[];

  const dailyResult = await db.execute(
    sql`SELECT t.item_id as "itemId", i.name as "itemName", i.uom as "uom",
               (t.created_at AT TIME ZONE 'UTC')::date as date, sum(t.qty) as qty
        FROM inventory_transactions t JOIN items i ON i.id = t.item_id
        WHERE (t.created_at AT TIME ZONE 'UTC')::date >= ${start}::date
        GROUP BY t.item_id, i.name, i.uom, (t.created_at AT TIME ZONE 'UTC')::date
        ORDER BY (t.created_at AT TIME ZONE 'UTC')::date ASC`
  );
  const daily = dailyResult.rows as unknown as { itemId: number; itemName: string; uom: string; date: string; qty: number }[];

  return { start, opening, daily };
}

export type StockTrend = Awaited<ReturnType<typeof getStockTrend>>;

// Lots with remaining stock for an item (FIFO order) — used by production issue
export async function getAvailableLots(itemId: number, warehouseId: number) {
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
    .orderBy(lots.receivedDate, lots.id);
}

// All batches with remaining stock, across every item/warehouse — used by
// the stock-adjustment dialog's batch picker (QC dispatch gate). Filtered
// client-side to the currently selected item+warehouse; small enough scale
// (one plant, dozens of live batches) that bulk-loading beats a round trip
// per item selection, matching how items/warehouses are already loaded.
export async function getAvailableBatches() {
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
    .orderBy(batches.mfgDate, batches.id);
}

// Batches still holding stock, with days-until-expiry (negative = already
// expired). Split into expired / near-expiry for the dashboard card and the
// Expiry tab; a batch expiring further out than `days` is omitted entirely.
export async function getExpiringBatches(days = 90) {
  const rows = await db
    .select({
      batchId: batches.id,
      batchNo: batches.batchNo,
      productName: products.name,
      expiryDate: batches.expiryDate,
      uom: batches.uom,
      qty: sql<number>`sum(${stockBalances.qty})`.as("qty"),
      daysUntilExpiry: sql<number>`(${batches.expiryDate}::date - current_date)`.as("daysUntilExpiry"),
    })
    .from(stockBalances)
    .innerJoin(batches, eq(stockBalances.batchId, batches.id))
    .innerJoin(products, eq(batches.productId, products.id))
    .groupBy(batches.id, products.name)
    .having(sql`abs(sum(${stockBalances.qty})) > 1e-9`)
    .orderBy(batches.expiryDate);

  const inWindow = rows.filter((r) => r.daysUntilExpiry <= days);
  return {
    expired: inWindow.filter((r) => r.daysUntilExpiry < 0),
    nearExpiry: inWindow.filter((r) => r.daysUntilExpiry >= 0),
  };
}

export type AgingBucket = "Fresh" | "Aging" | "Stale" | "Dead";

function ageBucket(days: number): AgingBucket {
  if (days < 30) return "Fresh";
  if (days < 90) return "Aging";
  if (days < 180) return "Stale";
  return "Dead";
}

// Every lot and batch still holding stock, with age since received/produced.
// Two separate queries (different source tables) rather than a SQL UNION —
// the UI merges and sorts them by age for one combined table.
export async function getAgingStock() {
  const lotRows = await db
    .select({
      kind: sql<"lot">`'lot'`.as("kind"),
      id: lots.id,
      code: lots.lotNo,
      label: items.name,
      qty: sql<number>`sum(${stockBalances.qty})`.as("qty"),
      uom: lots.uom,
      sinceDate: lots.receivedDate,
      ageDays: sql<number>`(current_date - ${lots.receivedDate}::date)`.as("ageDays"),
    })
    .from(stockBalances)
    .innerJoin(lots, eq(stockBalances.lotId, lots.id))
    .innerJoin(items, eq(lots.itemId, items.id))
    .groupBy(lots.id, items.name)
    .having(sql`abs(sum(${stockBalances.qty})) > 1e-9`);

  const batchRows = await db
    .select({
      kind: sql<"batch">`'batch'`.as("kind"),
      id: batches.id,
      code: batches.batchNo,
      label: products.name,
      qty: sql<number>`sum(${stockBalances.qty})`.as("qty"),
      uom: batches.uom,
      sinceDate: batches.mfgDate,
      ageDays: sql<number>`(current_date - ${batches.mfgDate}::date)`.as("ageDays"),
    })
    .from(stockBalances)
    .innerJoin(batches, eq(stockBalances.batchId, batches.id))
    .innerJoin(products, eq(batches.productId, products.id))
    .groupBy(batches.id, products.name)
    .having(sql`abs(sum(${stockBalances.qty})) > 1e-9`);

  return [...lotRows, ...batchRows]
    .map((r) => ({ ...r, bucket: ageBucket(r.ageDays) }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

export type StockRow = Awaited<ReturnType<typeof getStockOverview>>[number];
export type TransactionRow = Awaited<ReturnType<typeof getRecentTransactions>>[number];
export type AvailableBatchRow = Awaited<ReturnType<typeof getAvailableBatches>>[number];
export type ExpiringBatches = Awaited<ReturnType<typeof getExpiringBatches>>;
export type AgingRow = Awaited<ReturnType<typeof getAgingStock>>[number];
