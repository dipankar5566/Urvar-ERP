import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vendors, purchaseOrders, purchaseOrderLines, items, users } from "@/db/schema";

export async function getVendors() {
  return db.select().from(vendors).orderBy(vendors.name);
}

// PO list with per-PO aggregates — qty/received across lines, line count.
export async function getPurchaseOrders() {
  return db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      vendorName: vendors.name,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      remarks: purchaseOrders.remarks,
      createdByName: users.name,
      createdAt: purchaseOrders.createdAt,
      lineCount: sql<number>`count(${purchaseOrderLines.id})`.as("lineCount"),
      totalQty: sql<number>`coalesce(sum(${purchaseOrderLines.qty}), 0)`.as("totalQty"),
      totalReceived: sql<number>`coalesce(sum(${purchaseOrderLines.receivedQty}), 0)`.as("totalReceived"),
      totalValue: sql<number>`coalesce(sum(${purchaseOrderLines.qty} * ${purchaseOrderLines.rate}), 0)`.as(
        "totalValue"
      ),
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .innerJoin(users, eq(purchaseOrders.createdBy, users.id))
    .leftJoin(purchaseOrderLines, eq(purchaseOrderLines.poId, purchaseOrders.id))
    .groupBy(purchaseOrders.id, vendors.name, users.name)
    .orderBy(desc(purchaseOrders.id));
}

export async function getPurchaseOrderLines(poId: number) {
  return db
    .select({
      id: purchaseOrderLines.id,
      poId: purchaseOrderLines.poId,
      itemId: purchaseOrderLines.itemId,
      itemName: items.name,
      qty: purchaseOrderLines.qty,
      uom: purchaseOrderLines.uom,
      rate: purchaseOrderLines.rate,
      receivedQty: purchaseOrderLines.receivedQty,
    })
    .from(purchaseOrderLines)
    .innerJoin(items, eq(purchaseOrderLines.itemId, items.id))
    .where(eq(purchaseOrderLines.poId, poId));
}

// Every line across every PO, item name joined — bulk-loaded once for the
// list page's per-PO detail dialogs (small scale: dozens of POs, not worth a
// round trip per row click, matching how Masters bulk-loads formulaLines).
export async function getAllPurchaseOrderLines() {
  return db
    .select({
      id: purchaseOrderLines.id,
      poId: purchaseOrderLines.poId,
      itemId: purchaseOrderLines.itemId,
      itemName: items.name,
      qty: purchaseOrderLines.qty,
      uom: purchaseOrderLines.uom,
      rate: purchaseOrderLines.rate,
      receivedQty: purchaseOrderLines.receivedQty,
    })
    .from(purchaseOrderLines)
    .innerJoin(items, eq(purchaseOrderLines.itemId, items.id));
}

// Flat (vendorId, itemId, rate, createdAt) history, most recent first —
// the New/Edit PO dialog uses this client-side to suggest the last rate as
// item/vendor selections change, without a server round trip per keystroke.
export async function getRateHistory() {
  return db
    .select({
      vendorId: purchaseOrders.vendorId,
      itemId: purchaseOrderLines.itemId,
      rate: purchaseOrderLines.rate,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.poId, purchaseOrders.id))
    .where(sql`${purchaseOrders.status} != 'cancelled'`)
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id));
}

// All lines still open (parent PO approved/partially_received, qty remaining)
// — feeds the Goods Receipt "From Purchase Order" picker.
export async function getOpenPOLines() {
  return db
    .select({
      id: purchaseOrderLines.id,
      poId: purchaseOrderLines.poId,
      poNo: purchaseOrders.poNo,
      vendorId: purchaseOrders.vendorId,
      vendorName: vendors.name,
      itemId: purchaseOrderLines.itemId,
      itemName: items.name,
      qty: purchaseOrderLines.qty,
      uom: purchaseOrderLines.uom,
      rate: purchaseOrderLines.rate,
      receivedQty: purchaseOrderLines.receivedQty,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.poId, purchaseOrders.id))
    .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .innerJoin(items, eq(purchaseOrderLines.itemId, items.id))
    .where(
      sql`${purchaseOrders.status} IN ('approved', 'partially_received')
          AND ${purchaseOrderLines.receivedQty} < ${purchaseOrderLines.qty} - 1e-9`
    )
    .orderBy(purchaseOrders.id);
}

// Most recent rate paid to a vendor for an item — pre-fills a new PO line.
export async function getLastVendorRate(vendorId: number, itemId: number): Promise<number | null> {
  const row = (
    await db
      .select({ rate: purchaseOrderLines.rate })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.poId, purchaseOrders.id))
      .where(
        sql`${purchaseOrders.vendorId} = ${vendorId} AND ${purchaseOrderLines.itemId} = ${itemId}
          AND ${purchaseOrders.status} != 'cancelled'`
      )
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
      .limit(1)
  )[0];
  return row?.rate ?? null;
}

// Vendor of the most recent PO line for an item — feeds the Dashboard
// Quick-PO shortcut's default vendor selection.
export async function getLastVendorForItem(itemId: number): Promise<number | null> {
  const row = (
    await db
      .select({ vendorId: purchaseOrders.vendorId })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.poId, purchaseOrders.id))
      .where(sql`${purchaseOrderLines.itemId} = ${itemId} AND ${purchaseOrders.status} != 'cancelled'`)
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
      .limit(1)
  )[0];
  return row?.vendorId ?? null;
}

export type PurchaseOrderRow = Awaited<ReturnType<typeof getPurchaseOrders>>[number];
export type PurchaseOrderLineRow = Awaited<ReturnType<typeof getPurchaseOrderLines>>[number];
export type OpenPOLineRow = Awaited<ReturnType<typeof getOpenPOLines>>[number];
export type RateHistoryRow = Awaited<ReturnType<typeof getRateHistory>>[number];
