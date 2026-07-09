import { createHash } from "crypto";
import { asc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { zones, beds, orderBeds, siteFeatures } from "@/db/schema";
import { parseStoredDate } from "@/lib/dates";
import {
  MAINTENANCE_INTERVAL_DAYS,
  MAINTENANCE_TASK_TYPES,
  parsePolygon,
  type MaintenanceTaskType,
  type Pt,
} from "./types";

const STALE_READING_HOURS = 24;

type OccupancyRow = {
  bedId: number;
  orderId: number;
  orderNo: string;
  productName: string;
  assignedAt: string;
  orderBedId: number;
  stageName: string | null;
  stageRequiresReadings: number | null;
  readingParameter: string | null;
  readingValue: number | null;
  readingUnit: string | null;
  readingRecordedAt: string | null;
  readingIsDeviation: number | null;
  lastWatering: string | null;
  lastTurning: string | null;
  lastBioEnzyme: string | null;
};

// Rolling due-date computation for one maintenance task on one occupied
// bed: anchor is the last logged action, or the bed's own assignedAt
// ("windrow formation") if it's never been logged.
function computeMaintenanceTask(lastPerformed: string | null, assignedAt: string, intervalDays: number, now: number) {
  const anchorMs = lastPerformed ? parseStoredDate(lastPerformed).getTime() : parseStoredDate(assignedAt).getTime();
  const dueMs = anchorMs + intervalDays * 86_400_000;
  return {
    lastDone: lastPerformed,
    nextDueAt: new Date(dueMs).toISOString(),
    overdue: now > dueMs,
  };
}

// Fingerprint of everything the layout editor can change. The editor takes
// it when entering edit mode and sends it back with the save; a mismatch
// means another admin saved in between (last-write-wins would silently
// clobber their edits). Derived from the rows, not a stored counter — no
// extra table, can't drift.
export function computeLayoutVersion(): string {
  const bedRows = sqlite
    .prepare("SELECT id, zone_id, code, x1, y1, x2, y2, width_ft, active FROM beds ORDER BY id")
    .all();
  const featureRows = sqlite
    .prepare("SELECT id, kind, structure_type, label, polygon, warehouse_id, active FROM site_features ORDER BY id")
    .all();
  const zoneRows = sqlite.prepare("SELECT id, code, polygon, label_x, label_y FROM zones ORDER BY id").all();
  return createHash("sha1")
    .update(JSON.stringify([bedRows, featureRows, zoneRows]))
    .digest("hex")
    .slice(0, 16);
}

export function getBedLayout() {
  const zoneRows = db.select().from(zones).orderBy(asc(zones.code)).all();
  // Retired beds (active = false) keep their history but vanish from the
  // map and every consumer built on it (assignment pickers, dashboards).
  const bedRows = db.select().from(beds).where(eq(beds.active, true)).orderBy(asc(beds.code)).all();
  // Boundary, strip, and structures — all map geometry is data since the
  // Phase A refactor (site-geometry.ts constants are seed-only).
  const featureRows = db
    .select()
    .from(siteFeatures)
    .where(eq(siteFeatures.active, true))
    .orderBy(asc(siteFeatures.id))
    .all();

  // One row per occupied bed: its order, current in-progress stage, and
  // that bed's own most recent reading within the current stage.
  const occupancy = sqlite
    .prepare(
      `SELECT
         ob.bed_id as bedId,
         po.id as orderId,
         po.order_no as orderNo,
         pr.name as productName,
         ob.assigned_at as assignedAt,
         ob.id as orderBedId,
         os.name as stageName,
         os.requires_readings as stageRequiresReadings,
         sr.parameter as readingParameter,
         sr.value as readingValue,
         sr.unit as readingUnit,
         sr.recorded_at as readingRecordedAt,
         sr.is_deviation as readingIsDeviation,
         (SELECT MAX(bml.performed_at) FROM bed_maintenance_log bml
            WHERE bml.order_bed_id = ob.id AND bml.task_type = 'watering')   as lastWatering,
         (SELECT MAX(bml.performed_at) FROM bed_maintenance_log bml
            WHERE bml.order_bed_id = ob.id AND bml.task_type = 'turning')    as lastTurning,
         (SELECT MAX(bml.performed_at) FROM bed_maintenance_log bml
            WHERE bml.order_bed_id = ob.id AND bml.task_type = 'bio_enzyme') as lastBioEnzyme
       FROM order_beds ob
       JOIN production_orders po ON po.id = ob.order_id
       JOIN products pr ON pr.id = po.product_id
       LEFT JOIN order_stages os ON os.order_id = po.id AND os.status = 'in_progress'
       LEFT JOIN stage_readings sr ON sr.id = (
         SELECT sr2.id FROM stage_readings sr2
         WHERE sr2.bed_id = ob.bed_id AND sr2.order_stage_id = os.id
         ORDER BY sr2.recorded_at DESC, sr2.id DESC
         LIMIT 1
       )
       WHERE po.status = 'in_progress'`
    )
    .all() as OccupancyRow[];

  const now = Date.now();
  const occupiedBy = new Map(
    occupancy.map((o) => {
      const daysInBed = Math.floor((now - parseStoredDate(o.assignedAt).getTime()) / 86_400_000);
      const requiresReadings = !!o.stageRequiresReadings;
      const readingAgeHours = o.readingRecordedAt
        ? (now - parseStoredDate(o.readingRecordedAt).getTime()) / 3_600_000
        : null;
      const stale = requiresReadings && (readingAgeHours === null || readingAgeHours > STALE_READING_HOURS);
      const hasDeviation = !!o.readingIsDeviation;

      const lastByTask: Record<MaintenanceTaskType, string | null> = {
        watering: o.lastWatering,
        turning: o.lastTurning,
        bio_enzyme: o.lastBioEnzyme,
      };
      const maintenance = Object.fromEntries(
        MAINTENANCE_TASK_TYPES.map((t) => [
          t,
          computeMaintenanceTask(lastByTask[t], o.assignedAt, MAINTENANCE_INTERVAL_DAYS[t], now),
        ])
      ) as Record<MaintenanceTaskType, ReturnType<typeof computeMaintenanceTask>>;
      const maintenanceOverdueCount = MAINTENANCE_TASK_TYPES.filter((t) => maintenance[t].overdue).length;

      return [
        o.bedId,
        {
          orderId: o.orderId,
          orderNo: o.orderNo,
          productName: o.productName,
          assignedAt: o.assignedAt,
          orderBedId: o.orderBedId,
          daysInBed: Math.max(daysInBed, 0),
          stageName: o.stageName,
          stale,
          hasDeviation,
          latestReading: o.readingParameter
            ? {
                parameter: o.readingParameter,
                value: o.readingValue!,
                unit: o.readingUnit,
                recordedAt: o.readingRecordedAt!,
              }
            : null,
          maintenance,
          maintenanceOverdueCount,
        },
      ] as const;
    })
  );

  return {
    zones: zoneRows.map((z) => ({
      ...z,
      polygonPts: parsePolygon(z.polygon),
      labelPt: (z.labelX != null && z.labelY != null ? [z.labelX, z.labelY] : null) as Pt | null,
    })),
    beds: bedRows.map((b) => ({
      ...b,
      occupant: occupiedBy.get(b.id) ?? null,
    })),
    features: featureRows.map((f) => ({
      ...f,
      polygonPts: parsePolygon(f.polygon)!,
    })),
    version: computeLayoutVersion(),
  };
}

export type BedLayout = ReturnType<typeof getBedLayout>;
export type LayoutBed = BedLayout["beds"][number];

// Beds that are free (no in-progress order), for assignment pickers.
export function getBedsWithAvailability(excludeOrderId?: number) {
  const layout = getBedLayout();
  return layout.beds.map((b) => ({
    id: b.id,
    code: b.code,
    available: !b.occupant || b.occupant.orderId === excludeOrderId,
    occupantOrderNo: b.occupant?.orderNo ?? null,
  }));
}

export function getOrderBedIds(orderId: number): number[] {
  return db
    .select({ bedId: orderBeds.bedId })
    .from(orderBeds)
    .where(eq(orderBeds.orderId, orderId))
    .all()
    .map((r) => r.bedId);
}
