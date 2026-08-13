import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  lots,
  items,
  batches,
  products,
  productionOrders,
  batchTestResults,
  capas,
  users,
} from "@/db/schema";

export async function getLotsForInspection() {
  return db
    .select({
      id: lots.id,
      lotNo: lots.lotNo,
      itemName: items.name,
      supplierName: lots.supplierName,
      receivedQty: lots.receivedQty,
      uom: lots.uom,
      receivedDate: lots.receivedDate,
      qcStatus: lots.qcStatus,
      moisturePct: lots.moisturePct,
      foreignMatterPct: lots.foreignMatterPct,
      odour: lots.odour,
      visualCondition: lots.visualCondition,
      inspectionRemarks: lots.inspectionRemarks,
      inspectedAt: lots.inspectedAt,
    })
    .from(lots)
    .innerJoin(items, eq(lots.itemId, items.id))
    .orderBy(desc(lots.id));
}

export async function getBatchesForQC() {
  return db
    .select({
      id: batches.id,
      batchNo: batches.batchNo,
      productName: products.name,
      orderNo: productionOrders.orderNo,
      mfgDate: batches.mfgDate,
      qcStatus: batches.qcStatus,
      yieldPct: batches.yieldPct,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .innerJoin(productionOrders, eq(batches.orderId, productionOrders.id))
    .orderBy(desc(batches.id));
}

export async function getBatchTestResults(batchId: number) {
  return db
    .select({
      id: batchTestResults.id,
      parameter: batchTestResults.parameter,
      value: batchTestResults.value,
      textValue: batchTestResults.textValue,
      unit: batchTestResults.unit,
      recordedAt: batchTestResults.recordedAt,
      recordedByName: users.name,
    })
    .from(batchTestResults)
    .innerJoin(users, eq(batchTestResults.recordedBy, users.id))
    .where(eq(batchTestResults.batchId, batchId))
    .orderBy(desc(batchTestResults.id));
}

export async function getCapas() {
  return db
    .select({
      id: capas.id,
      capaNo: capas.capaNo,
      issue: capas.issue,
      status: capas.status,
      deadline: capas.deadline,
      responsibleName: users.name,
      linkedBatchNo: batches.batchNo,
      createdAt: capas.createdAt,
      closedAt: capas.closedAt,
    })
    .from(capas)
    .leftJoin(users, eq(capas.responsibleUserId, users.id))
    .leftJoin(batches, eq(capas.linkedBatchId, batches.id))
    .orderBy(desc(capas.id));
}

export async function getCapaDetail(capaId: number) {
  return (
    await db
      .select({
        id: capas.id,
        capaNo: capas.capaNo,
        issue: capas.issue,
        rootCause: capas.rootCause,
        correctiveAction: capas.correctiveAction,
        preventiveAction: capas.preventiveAction,
        status: capas.status,
        deadline: capas.deadline,
        responsibleUserId: capas.responsibleUserId,
        verificationNotes: capas.verificationNotes,
        createdAt: capas.createdAt,
        closedAt: capas.closedAt,
        linkedBatchNo: batches.batchNo,
      })
      .from(capas)
      .leftJoin(batches, eq(capas.linkedBatchId, batches.id))
      .where(eq(capas.id, capaId))
  )[0];
}

export type LotForInspection = Awaited<ReturnType<typeof getLotsForInspection>>[number];
export type BatchForQC = Awaited<ReturnType<typeof getBatchesForQC>>[number];
export type BatchTestResultRow = Awaited<ReturnType<typeof getBatchTestResults>>[number];
export type CapaRow = Awaited<ReturnType<typeof getCapas>>[number];
