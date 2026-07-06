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
} from "@/db/schema";

export function getOrders() {
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
    .orderBy(desc(productionOrders.id))
    .all();
}

export function getOrderDetail(orderId: number) {
  const order = db
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
    .get();
  if (!order) return null;

  const stages = db
    .select()
    .from(orderStages)
    .where(eq(orderStages.orderId, orderId))
    .orderBy(asc(orderStages.seq))
    .all();

  const readings = db
    .select({
      id: stageReadings.id,
      orderStageId: stageReadings.orderStageId,
      parameter: stageReadings.parameter,
      value: stageReadings.value,
      unit: stageReadings.unit,
      notes: stageReadings.notes,
      recordedAt: stageReadings.recordedAt,
      recordedByName: users.name,
    })
    .from(stageReadings)
    .innerJoin(users, eq(stageReadings.recordedBy, users.id))
    .where(
      sql`${stageReadings.orderStageId} IN (SELECT id FROM order_stages WHERE order_id = ${orderId})`
    )
    .orderBy(desc(stageReadings.id))
    .all();

  const batch = db
    .select({ id: batches.id, batchNo: batches.batchNo, yieldPct: batches.yieldPct })
    .from(batches)
    .where(eq(batches.orderId, orderId))
    .get();

  return { order, stages, readings, batch: batch ?? null };
}

export type OrderRow = ReturnType<typeof getOrders>[number];
export type OrderDetail = NonNullable<ReturnType<typeof getOrderDetail>>;
