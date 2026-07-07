import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { zones, beds, orderBeds, productionOrders, products } from "@/db/schema";

export function getBedLayout() {
  const zoneRows = db.select().from(zones).orderBy(asc(zones.code)).all();
  const bedRows = db.select().from(beds).orderBy(asc(beds.code)).all();

  // Beds occupied by in-progress orders
  const occupancy = db
    .select({
      bedId: orderBeds.bedId,
      orderId: productionOrders.id,
      orderNo: productionOrders.orderNo,
      productName: products.name,
      startedAt: productionOrders.startedAt,
    })
    .from(orderBeds)
    .innerJoin(productionOrders, eq(orderBeds.orderId, productionOrders.id))
    .innerJoin(products, eq(productionOrders.productId, products.id))
    .where(eq(productionOrders.status, "in_progress"))
    .all();

  const occupiedBy = new Map(occupancy.map((o) => [o.bedId, o]));

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
