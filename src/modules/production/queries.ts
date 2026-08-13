import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  productionOrders,
  orderStages,
  stageReadings,
  products,
  formulas,
  warehouses,
  users,
  batches,
  productionRequests,
} from "@/db/schema";

// Pending sales-handoff requests from CRM (see D:\urvar-erp's Phase 4
// integration) — a supervisor reviews these and converts each into a real
// production order via the existing New Order form.
export async function getPendingProductionRequests() {
  return db
    .select({
      id: productionRequests.id,
      productId: productionRequests.productId,
      productName: products.name,
      requestedQty: productionRequests.requestedQty,
      uom: productionRequests.uom,
      crmQuotationNumber: productionRequests.crmQuotationNumber,
      crmCustomerName: productionRequests.crmCustomerName,
      createdAt: productionRequests.createdAt,
    })
    .from(productionRequests)
    .innerJoin(products, eq(productionRequests.productId, products.id))
    .where(eq(productionRequests.status, "pending"))
    .orderBy(asc(productionRequests.createdAt));
}

export type PendingProductionRequest = Awaited<ReturnType<typeof getPendingProductionRequests>>[number];

export async function getOrders() {
  const currentStage = db
    .select({
      orderId: orderStages.orderId,
      name: sql<string>`min(${orderStages.name})`.as("current_stage"),
    })
    .from(orderStages)
    .where(eq(orderStages.status, "in_progress"))
    .groupBy(orderStages.orderId)
    .as("cs");

  return db
    .select({
      id: productionOrders.id,
      orderNo: productionOrders.orderNo,
      status: productionOrders.status,
      targetQty: productionOrders.targetQty,
      uom: productionOrders.uom,
      shift: productionOrders.shift,
      createdAt: productionOrders.createdAt,
      startedAt: productionOrders.startedAt,
      completedAt: productionOrders.completedAt,
      productName: products.name,
      supervisorName: users.name,
      currentStage: currentStage.name,
    })
    .from(productionOrders)
    .innerJoin(products, eq(productionOrders.productId, products.id))
    .innerJoin(users, eq(productionOrders.supervisorId, users.id))
    .leftJoin(currentStage, eq(currentStage.orderId, productionOrders.id))
    .orderBy(desc(productionOrders.id));
}

export async function getOrderDetail(orderId: number) {
  const order = (
    await db
      .select({
        id: productionOrders.id,
        orderNo: productionOrders.orderNo,
        status: productionOrders.status,
        targetQty: productionOrders.targetQty,
        uom: productionOrders.uom,
        shift: productionOrders.shift,
        remarks: productionOrders.remarks,
        plannedStart: productionOrders.plannedStart,
        plannedEnd: productionOrders.plannedEnd,
        startedAt: productionOrders.startedAt,
        completedAt: productionOrders.completedAt,
        createdAt: productionOrders.createdAt,
        productName: products.name,
        formulaName: formulas.name,
        warehouseName: warehouses.name,
        supervisorName: users.name,
      })
      .from(productionOrders)
      .innerJoin(products, eq(productionOrders.productId, products.id))
      .innerJoin(formulas, eq(productionOrders.formulaId, formulas.id))
      .innerJoin(warehouses, eq(productionOrders.warehouseId, warehouses.id))
      .innerJoin(users, eq(productionOrders.supervisorId, users.id))
      .where(eq(productionOrders.id, orderId))
  )[0];
  if (!order) return null;

  const stages = await db.select().from(orderStages).where(eq(orderStages.orderId, orderId)).orderBy(asc(orderStages.seq));

  const readings = await db
    .select({
      id: stageReadings.id,
      orderStageId: stageReadings.orderStageId,
      parameter: stageReadings.parameter,
      value: stageReadings.value,
      unit: stageReadings.unit,
      notes: stageReadings.notes,
      isDeviation: stageReadings.isDeviation,
      recordedAt: stageReadings.recordedAt,
      recordedByName: users.name,
    })
    .from(stageReadings)
    .innerJoin(users, eq(stageReadings.recordedBy, users.id))
    .where(
      sql`${stageReadings.orderStageId} IN (SELECT id FROM order_stages WHERE order_id = ${orderId})`
    )
    .orderBy(desc(stageReadings.id));

  const batch = (
    await db
      .select({ id: batches.id, batchNo: batches.batchNo, yieldPct: batches.yieldPct })
      .from(batches)
      .where(eq(batches.orderId, orderId))
  )[0];

  return { order, stages, readings, batch: batch ?? null };
}

export type OrderRow = Awaited<ReturnType<typeof getOrders>>[number];
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;
