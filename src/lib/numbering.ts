// Sequential document numbers: LOT-2607-001, PO-2607-002, ...
// Batch numbers: UV-VC-260707-01
// Must be called inside an atomic() transaction to avoid duplicate numbers.

import { sqlite } from "@/db";

function yymm(date = new Date()): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yymmdd(date = new Date()): string {
  return `${yymm(date)}${String(date.getDate()).padStart(2, "0")}`;
}

const DOC_NUMBER_TARGETS = {
  LOT: { table: "lots", column: "lot_no" },
  PO: { table: "production_orders", column: "order_no" },
  CAPA: { table: "capas", column: "capa_no" },
  TRF: { table: "transfers", column: "transfer_no" },
  PUR: { table: "purchase_orders", column: "po_no" },
} as const;

export function nextDocNumber(prefix: keyof typeof DOC_NUMBER_TARGETS, date = new Date()): string {
  const period = yymm(date);
  const { table, column } = DOC_NUMBER_TARGETS[prefix];
  const pattern = `${prefix}-${period}-%`;
  const row = sqlite
    .prepare(`SELECT COUNT(*) as n FROM ${table} WHERE ${column} LIKE ?`)
    .get(pattern) as { n: number };
  return `${prefix}-${period}-${String(row.n + 1).padStart(3, "0")}`;
}

export function nextBatchNumber(productCode: string, date = new Date()): string {
  const day = yymmdd(date);
  const pattern = `UV-${productCode}-${day}-%`;
  const row = sqlite
    .prepare(`SELECT COUNT(*) as n FROM batches WHERE batch_no LIKE ?`)
    .get(pattern) as { n: number };
  return `UV-${productCode}-${day}-${String(row.n + 1).padStart(2, "0")}`;
}
