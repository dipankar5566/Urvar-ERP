// FIFO stock selection, shared by production issue, bed maintenance, and
// warehouse transfers. Must be called inside atomic() — reads
// stock_balances/lots without locking, callers are expected to post the
// resulting transactions in the same transaction so the picture doesn't
// change underneath them.

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stockBalances, lots, items } from "@/db/schema";

export type FifoPick = { lotId: number | null; zoneId: number | null; qty: number };

// Oldest-received lot first, excluding rejected lots (pending/uninspected
// lots stay usable — see startProductionOrder's original comment). Falls
// back to "loose" (non-lot-tracked) stock, e.g. from adjustments, if FIFO
// lots don't cover the full quantity. Throws if the item can't be fully
// covered — same shortage message shape production issue has always used.
//
// Each pick carries the zoneId its stock actually sits in — stock_balances
// is keyed on zone as well as lot, so callers MUST pass that zoneId back
// into postTransaction rather than omitting it. Omitting it makes
// postTransaction target a different (zone-less) balance row than the one
// this function actually picked from, which throws a false "insufficient
// stock" error even though the real stock is sitting right there in a zone.
// Pass `zoneId` to restrict selection to one zone (e.g. a transfer with an
// explicit source zone); omit it and FIFO searches the whole warehouse
// regardless of zone, same as before this parameter existed.
export function pickFifoLots(
  itemId: number,
  warehouseId: number,
  qty: number,
  zoneId?: number
): FifoPick[] {
  const picks: FifoPick[] = [];
  let remaining = qty;

  const lotRows = db
    .select({ lotId: lots.id, zoneId: stockBalances.zoneId, qty: stockBalances.qty })
    .from(stockBalances)
    .innerJoin(lots, eq(stockBalances.lotId, lots.id))
    .where(
      and(
        eq(stockBalances.itemId, itemId),
        eq(stockBalances.warehouseId, warehouseId),
        zoneId === undefined ? undefined : eq(stockBalances.zoneId, zoneId),
        sql`${stockBalances.qty} > 1e-9`,
        sql`${lots.qcStatus} != 'rejected'`
      )
    )
    .orderBy(asc(lots.receivedDate), asc(lots.id))
    .all();

  for (const lotRow of lotRows) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, lotRow.qty);
    picks.push({ lotId: lotRow.lotId, zoneId: lotRow.zoneId, qty: take });
    remaining -= take;
  }

  if (remaining > 1e-9) {
    const looseBalance = db
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.itemId, itemId),
          eq(stockBalances.warehouseId, warehouseId),
          zoneId === undefined ? undefined : eq(stockBalances.zoneId, zoneId),
          sql`${stockBalances.lotId} IS NULL`,
          sql`${stockBalances.qty} > 1e-9`
        )
      )
      .get();
    if (looseBalance) {
      const take = Math.min(remaining, looseBalance.qty);
      picks.push({ lotId: null, zoneId: looseBalance.zoneId, qty: take });
      remaining -= take;
    }
  }

  if (remaining > 1e-9) {
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    throw new Error(
      `Insufficient stock of "${item?.name ?? `item #${itemId}`}": short by ${Number(remaining.toFixed(3))} ${item?.uom ?? ""}`
    );
  }

  return picks;
}
