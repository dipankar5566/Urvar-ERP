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
      laborCost: batches.laborCost,
      overheadCost: batches.overheadCost,
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
      // Null when the lot's rate was never recorded (e.g. an ad-hoc receipt
      // with the rate field left blank) — cost callers must treat that as
      // "unknown," not zero, so the total doesn't silently understate cost.
      rate: lots.rate,
    })
    .from(batchInputs)
    .innerJoin(items, eq(batchInputs.itemId, items.id))
    .innerJoin(lots, eq(batchInputs.lotId, lots.id))
    .where(eq(batchInputs.batchId, batchId))
    .all();

  // Material cost per input line (null rate → line cost unknown, excluded
  // from the total rather than treated as zero) plus labor/overhead — see
  // batches.laborCost/overheadCost, manual entries at Complete Order time.
  const materialCost = inputs.reduce(
    (sum, i) => (i.rate === null ? sum : sum + i.rate * i.qtyConsumed),
    0
  );
  const hasUnknownRate = inputs.some((i) => i.rate === null);
  const totalCost = materialCost + (batch.laborCost ?? 0) + (batch.overheadCost ?? 0);
  const costPerUnit = batch.qtyProduced > 0 ? totalCost / batch.qtyProduced : null;

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

  return {
    batch,
    inputs,
    stages,
    readings,
    currentStock: currentStock?.qty ?? 0,
    cost: { materialCost, hasUnknownRate, totalCost, costPerUnit },
  };
}

// Cost-per-unit + yield for recent batches, for the batches-page chart.
// Kept per-product downstream (the chart filters to one product at a time) —
// ₹/ton and ₹/litre don't belong on one axis. costPartial marks batches with
// at least one unknown-rate input: their cost understates the real number.
export function getBatchCostYieldSeries(limit = 30) {
  const rows = db
    .select({
      id: batches.id,
      batchNo: batches.batchNo,
      mfgDate: batches.mfgDate,
      productId: batches.productId,
      productName: products.name,
      uom: batches.uom,
      qtyProduced: batches.qtyProduced,
      yieldPct: batches.yieldPct,
      laborCost: batches.laborCost,
      overheadCost: batches.overheadCost,
      materialCost: sql<number | null>`(
        SELECT sum(bi.qty_consumed * l.rate) FROM batch_inputs bi
        JOIN lots l ON l.id = bi.lot_id
        WHERE bi.batch_id = ${batches.id} AND l.rate IS NOT NULL)`,
      costPartial: sql<number>`EXISTS(
        SELECT 1 FROM batch_inputs bi JOIN lots l ON l.id = bi.lot_id
        WHERE bi.batch_id = ${batches.id} AND l.rate IS NULL)`,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .orderBy(desc(batches.id))
    .limit(limit)
    .all();

  return rows
    .map((r) => {
      const totalCost = (r.materialCost ?? 0) + (r.laborCost ?? 0) + (r.overheadCost ?? 0);
      return {
        ...r,
        costPartial: !!r.costPartial,
        costPerUnit: r.qtyProduced > 0 ? totalCost / r.qtyProduced : null,
      };
    })
    .reverse(); // oldest → newest for the time axis
}

export type BatchCostYieldRow = ReturnType<typeof getBatchCostYieldSeries>[number];

export type BatchRow = ReturnType<typeof getBatches>[number];
export type BatchDetail = NonNullable<ReturnType<typeof getBatchDetail>>;
