// Inventory ledger core — every stock movement flows through postTransaction,
// inside a caller-provided SQLite transaction. Stock balances are maintained
// in the same transaction; negative stock is blocked.

import { db, sqlite } from "@/db";
import { inventoryTransactions, stockBalances, items, auditLog } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export type LedgerEntry = {
  type:
    | "goods_receipt"
    | "issue_to_production"
    | "issue_to_bed_maintenance"
    | "production_output"
    | "adjustment"
    | "transfer_out"
    | "transfer_in";
  itemId: number;
  warehouseId: number;
  zoneId?: number | null;
  lotId?: number | null;
  batchId?: number | null;
  qty: number; // signed: + in, − out
  uom: "kg" | "ton" | "bag" | "litre" | "nos" | "tractor" | "roll";
  refType?: string;
  refId?: number;
  reason?: string;
  userId: number;
};

// Must be called inside sqlite.transaction()
export function postTransaction(entry: LedgerEntry) {
  const zoneId = entry.zoneId ?? null;
  const lotId = entry.lotId ?? null;
  const batchId = entry.batchId ?? null;

  const balanceWhere = and(
    eq(stockBalances.itemId, entry.itemId),
    eq(stockBalances.warehouseId, entry.warehouseId),
    zoneId === null ? isNull(stockBalances.zoneId) : eq(stockBalances.zoneId, zoneId),
    lotId === null ? isNull(stockBalances.lotId) : eq(stockBalances.lotId, lotId),
    batchId === null ? isNull(stockBalances.batchId) : eq(stockBalances.batchId, batchId)
  );

  const existing = db.select().from(stockBalances).where(balanceWhere).get();
  const newQty = (existing?.qty ?? 0) + entry.qty;

  if (newQty < -1e-9) {
    const item = db.select().from(items).where(eq(items.id, entry.itemId)).get();
    throw new Error(
      `Insufficient stock of "${item?.name ?? `item #${entry.itemId}`}": ` +
        `available ${existing?.qty ?? 0} ${entry.uom}, requested ${Math.abs(entry.qty)} ${entry.uom}`
    );
  }

  db.insert(inventoryTransactions)
    .values({
      type: entry.type,
      itemId: entry.itemId,
      warehouseId: entry.warehouseId,
      zoneId,
      lotId,
      batchId,
      qty: entry.qty,
      uom: entry.uom,
      refType: entry.refType,
      refId: entry.refId,
      reason: entry.reason,
      createdBy: entry.userId,
    })
    .run();

  if (existing) {
    db.update(stockBalances).set({ qty: newQty }).where(eq(stockBalances.id, existing.id)).run();
  } else {
    db.insert(stockBalances)
      .values({
        itemId: entry.itemId,
        warehouseId: entry.warehouseId,
        zoneId,
        lotId,
        batchId,
        qty: newQty,
        uom: entry.uom,
      })
      .run();
  }
}

export function writeAudit(params: {
  actorId: number;
  action: string;
  entity: string;
  entityId?: number;
  before?: unknown;
  after?: unknown;
}) {
  db.insert(auditLog)
    .values({
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before ? JSON.stringify(params.before) : null,
      after: params.after ? JSON.stringify(params.after) : null,
    })
    .run();
}

// Run fn atomically in a SQLite transaction
export function atomic<T>(fn: () => T): T {
  return sqlite.transaction(fn)();
}
