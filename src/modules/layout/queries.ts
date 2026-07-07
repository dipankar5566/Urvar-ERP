import { asc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { zones, beds, orderBeds } from "@/db/schema";
import { parseStoredDate } from "@/lib/dates";

const STALE_READING_HOURS = 24;

type OccupancyRow = {
  bedId: number;
  orderId: number;
  orderNo: string;
  productName: string;
  assignedAt: string;
  stageName: string | null;
  stageRequiresReadings: number | null;
  readingParameter: string | null;
  readingValue: number | null;
  readingUnit: string | null;
  readingRecordedAt: string | null;
};

export function getBedLayout() {
  const zoneRows = db.select().from(zones).orderBy(asc(zones.code)).all();
  const bedRows = db.select().from(beds).orderBy(asc(beds.code)).all();

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
         os.name as stageName,
         os.requires_readings as stageRequiresReadings,
         sr.parameter as readingParameter,
         sr.value as readingValue,
         sr.unit as readingUnit,
         sr.recorded_at as readingRecordedAt
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

      return [
        o.bedId,
        {
          orderId: o.orderId,
          orderNo: o.orderNo,
          productName: o.productName,
          assignedAt: o.assignedAt,
          daysInBed: Math.max(daysInBed, 0),
          stageName: o.stageName,
          stale,
          latestReading: o.readingParameter
            ? {
                parameter: o.readingParameter,
                value: o.readingValue!,
                unit: o.readingUnit,
                recordedAt: o.readingRecordedAt!,
              }
            : null,
        },
      ] as const;
    })
  );

  return {
    zones: zoneRows,
    beds: bedRows.map((b) => ({
      ...b,
      occupant: occupiedBy.get(b.id) ?? null,
    })),
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
