import { sqlite } from "@/db";
import { localDateISO } from "@/lib/dates";

export function getDashboardData() {
  const today = localDateISO();
  const monthStart = today.slice(0, 8) + "01";

  const todayProduction = sqlite
    .prepare(`SELECT coalesce(sum(qty_produced), 0) as qty FROM batches WHERE mfg_date = ?`)
    .get(today) as { qty: number };

  const monthProduction = sqlite
    .prepare(`SELECT coalesce(sum(qty_produced), 0) as qty FROM batches WHERE mfg_date >= ?`)
    .get(monthStart) as { qty: number };

  const monthTarget = sqlite
    .prepare(
      `SELECT coalesce(sum(target_qty), 0) as qty FROM production_orders
       WHERE status IN ('in_progress', 'completed') AND date(created_at) >= ?`
    )
    .get(monthStart) as { qty: number };

  const avgYield = sqlite
    .prepare(`SELECT avg(yield_pct) as pct FROM batches WHERE mfg_date >= ?`)
    .get(monthStart) as { pct: number | null };

  const activeOrders = sqlite
    .prepare(
      `SELECT po.id, po.order_no as orderNo, p.name as productName, po.target_qty as targetQty,
              po.uom, u.name as supervisorName,
              (SELECT name FROM order_stages WHERE order_id = po.id AND status = 'in_progress'
               ORDER BY seq LIMIT 1) as currentStage
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       JOIN users u ON u.id = po.supervisor_id
       WHERE po.status = 'in_progress'
       ORDER BY po.id DESC`
    )
    .all() as {
    id: number;
    orderNo: string;
    productName: string;
    targetQty: number;
    uom: string;
    supervisorName: string;
    currentStage: string | null;
  }[];

  const lowStock = sqlite
    .prepare(
      `SELECT i.name as itemName, i.uom, i.reorder_level as reorderLevel,
              coalesce(sum(sb.qty), 0) as qty
       FROM items i
       LEFT JOIN stock_balances sb ON sb.item_id = i.id
       WHERE i.active = 1 AND i.reorder_level > 0
       GROUP BY i.id
       HAVING coalesce(sum(sb.qty), 0) <= i.reorder_level
       ORDER BY qty / i.reorder_level`
    )
    .all() as { itemName: string; uom: string; reorderLevel: number; qty: number }[];

  const recentBatches = sqlite
    .prepare(
      `SELECT b.id, b.batch_no as batchNo, p.name as productName, b.qty_produced as qtyProduced,
              b.uom, b.yield_pct as yieldPct, b.qc_status as qcStatus, b.mfg_date as mfgDate
       FROM batches b JOIN products p ON p.id = b.product_id
       ORDER BY b.id DESC LIMIT 5`
    )
    .all() as {
    id: number;
    batchNo: string;
    productName: string;
    qtyProduced: number;
    uom: string;
    yieldPct: number;
    qcStatus: string;
    mfgDate: string;
  }[];

  return {
    todayProduction: todayProduction.qty,
    monthProduction: monthProduction.qty,
    monthTarget: monthTarget.qty,
    avgYield: avgYield.pct,
    activeOrders,
    lowStock,
    recentBatches,
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
