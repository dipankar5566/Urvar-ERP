import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  batches,
  batchInputs,
  products,
  productionOrders,
  warehouses,
  lots,
  items,
  orderStages,
  stageReadings,
  users,
  stockBalances,
} from "@/db/schema";

export function getBatches() {
  return db
    .select({
      id: batches.id,
      batchNo: batches.batchNo,
      mfgDate: batches.mfgDate,
      expiryDate: batches.expiryDate,
      qtyProduced: batches.qtyProduced,
      uom: batches.uom,
      yieldPct: batches.yieldPct,
      qcStatus: batches.qcStatus,
      dispatchStatus: batches.dispatchStatus,
      productName: products.name,
      orderNo: productionOrders.orderNo,
      warehouseName: warehouses.name,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .innerJoin(productionOrders, eq(batches.orderId, productionOrders.id))
    .innerJoin(warehouses, eq(batches.warehouseId, warehouses.id))
    .orderBy(desc(batches.id))
    .all();
}

export function getBatchDetail(batchId: number) {
  const batch = db
    .select({
      id: batches.id,
      batchNo: batches.batchNo,
      mfgDate: batches.mfgDate,
      expiryDate: batches.expiryDate,
      qtyProduced: batches.qtyProduced,
      expectedQty: batches.expectedQty,
      uom: batches.uom,
      yieldPct: batches.yieldPct,
      qcStatus: batches.qcStatus,
      dispatchStatus: batches.dispatchStatus,
      createdAt: batches.createdAt,
      orderId: batches.orderId,
      productName: products.name,
      orderNo: productionOrders.orderNo,
      warehouseName: warehouses.name,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .innerJoin(productionOrders, eq(batches.orderId, productionOrders.id))
    .innerJoin(warehouses, eq(batches.warehouseId, warehouses.id))
    .where(eq(batches.id, batchId))
    .get();
  if (!batch) return null;

  const inputs = db
    .select({
      id: batchInputs.id,
      qtyConsumed: batchInputs.qtyConsumed,
      uom: batchInputs.uom,
      itemName: items.name,
      lotNo: lots.lotNo,
      supplierName: lots.supplierName,
      receivedDate: lots.receivedDate,
    })
    .from(batchInputs)
    .innerJoin(items, eq(batchInputs.itemId, items.id))
    .innerJoin(lots, eq(batchInputs.lotId, lots.id))
    .where(eq(batchInputs.batchId, batchId))
    .all();

  const stages = db
    .select()
    .from(orderStages)
    .where(eq(orderStages.orderId, batch.orderId))
    .orderBy(asc(orderStages.seq))
    .all();

  const readings = db
    .select({
      id: stageReadings.id,
      orderStageId: stageReadings.orderStageId,
      parameter: stageReadings.parameter,
      value: stageReadings.value,
      unit: stageReadings.unit,
      isDeviation: stageReadings.isDeviation,
      recordedAt: stageReadings.recordedAt,
      recordedByName: users.name,
    })
    .from(stageReadings)
    .innerJoin(users, eq(stageReadings.recordedBy, users.id))
    .where(
      sql`${stageReadings.orderStageId} IN (SELECT id FROM order_stages WHERE order_id = ${batch.orderId})`
    )
    .orderBy(asc(stageReadings.id))
    .all();

  const currentStock = db
    .select({ qty: sql<number>`coalesce(sum(${stockBalances.qty}), 0)` })
    .from(stockBalances)
    .where(eq(stockBalances.batchId, batchId))
    .get();

  return { batch, inputs, stages, readings, currentStock: currentStock?.qty ?? 0 };
}

export type BatchRow = ReturnType<typeof getBatches>[number];
export type BatchDetail = NonNullable<ReturnType<typeof getBatchDetail>>;
