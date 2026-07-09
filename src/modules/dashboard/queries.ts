import { sqlite } from "@/db";
import { localDateISO } from "@/lib/dates";
import { getExpiringBatches } from "@/modules/inventory/queries";
import { getBedLayout } from "@/modules/layout/queries";
import type { MaintenanceTaskType } from "@/modules/layout/types";

export function getDashboardData() {
  const today = localDateISO();
  const monthStart = today.slice(0, 8) + "01";

  // Per-product, not cumulative — summing qty_produced across products blindly
  // mixes units (ton + litre + kg would all get added as one number), so a
  // single cumulative total is not just non-specific, it's actively wrong.
  // Only products with a batch or an active/completed order this month get a
  // row, so the dashboard doesn't carry a permanent list of zeros.
  const productionByProduct = sqlite
    .prepare(
      `SELECT
         p.id as productId,
         p.name as productName,
         i.uom as uom,
         coalesce((SELECT sum(b.qty_produced) FROM batches b
                   WHERE b.product_id = p.id AND b.mfg_date = @today), 0) as todayQty,
         coalesce((SELECT sum(b.qty_produced) FROM batches b
                   WHERE b.product_id = p.id AND b.mfg_date >= @monthStart), 0) as monthQty,
         coalesce((SELECT sum(po.target_qty) FROM production_orders po
                   WHERE po.product_id = p.id AND po.status IN ('in_progress', 'completed')
                     AND date(po.created_at) >= @monthStart), 0) as monthTarget,
         (SELECT avg(b.yield_pct) FROM batches b
            WHERE b.product_id = p.id AND b.mfg_date >= @monthStart) as avgYield
       FROM products p
       LEFT JOIN items i ON i.product_id = p.id AND i.category = 'finished_good'
       WHERE p.active = 1
         AND (
           EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.mfg_date >= @monthStart)
           OR EXISTS (SELECT 1 FROM production_orders po WHERE po.product_id = p.id
                        AND po.status IN ('in_progress', 'completed') AND date(po.created_at) >= @monthStart)
         )
       ORDER BY monthQty DESC, p.name ASC`
    )
    .all({ today, monthStart }) as {
    productId: number;
    productName: string;
    uom: string | null;
    todayQty: number;
    monthQty: number;
    monthTarget: number;
    avgYield: number | null;
  }[];

  // Daily production over the last 30 days, kept per-product for the same
  // unit-mixing reason as above — the chart shows one product at a time.
  const trendStart = localDateISO(new Date(Date.now() - 29 * 86_400_000));
  const productionTrend = sqlite
    .prepare(
      `SELECT b.product_id as productId, p.name as productName, b.uom as uom,
              b.mfg_date as date, sum(b.qty_produced) as qty
       FROM batches b JOIN products p ON p.id = b.product_id
       WHERE b.mfg_date >= @trendStart
       GROUP BY b.product_id, b.mfg_date
       ORDER BY b.mfg_date ASC`
    )
    .all({ trendStart }) as {
    productId: number;
    productName: string;
    uom: string;
    date: string;
    qty: number;
  }[];

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
      `SELECT i.id as itemId, i.name as itemName, i.uom, i.reorder_level as reorderLevel,
              coalesce(sum(sb.qty), 0) as qty
       FROM items i
       LEFT JOIN stock_balances sb ON sb.item_id = i.id
       WHERE i.active = 1 AND i.reorder_level > 0
       GROUP BY i.id
       HAVING coalesce(sum(sb.qty), 0) <= i.reorder_level
       ORDER BY qty / i.reorder_level`
    )
    .all() as { itemId: number; itemName: string; uom: string; reorderLevel: number; qty: number }[];

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

  const pendingInspections = sqlite
    .prepare(`SELECT count(*) as n FROM lots WHERE qc_status = 'pending'`)
    .get() as { n: number };

  const batchesAwaitingQC = sqlite
    .prepare(
      `SELECT count(*) as n FROM batches WHERE qc_status IN ('pending', 'sample_collected', 'testing')`
    )
    .get() as { n: number };

  const batchesOnHold = sqlite
    .prepare(`SELECT count(*) as n FROM batches WHERE qc_status = 'hold'`)
    .get() as { n: number };

  const openCapas = sqlite
    .prepare(`SELECT count(*) as n FROM capas WHERE status != 'closed'`)
    .get() as { n: number };

  const expiring = getExpiringBatches();

  const layout = getBedLayout();
  const maintenanceAlerts = layout.beds
    .filter((b) => b.occupant && b.occupant.maintenanceOverdueCount > 0)
    .flatMap((b) =>
      (Object.entries(b.occupant!.maintenance) as [MaintenanceTaskType, { overdue: boolean }][])
        .filter(([, t]) => t.overdue)
        .map(([taskType]) => ({ bedCode: b.code, orderNo: b.occupant!.orderNo, taskType }))
    );

  return {
    productionByProduct,
    productionTrend,
    activeOrders,
    lowStock,
    expiring,
    recentBatches,
    pendingInspections: pendingInspections.n,
    batchesAwaitingQC: batchesAwaitingQC.n,
    batchesOnHold: batchesOnHold.n,
    openCapas: openCapas.n,
    maintenanceAlerts,
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
