"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { orderBeds, productionOrders, beds } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { atomic, writeAudit } from "@/lib/ledger";
import type { ActionResult } from "@/modules/masters/actions";

// Replace an order's bed assignment. Beds occupied by another in-progress
// order are rejected.
export async function assignBeds(orderId: number, bedIds: number[]): Promise<ActionResult> {
  try {
    const user = await requireUser();

    atomic(() => {
      const order = db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, orderId))
        .get();
      if (!order) throw new Error("Order not found");
      if (order.status === "completed" || order.status === "cancelled") {
        throw new Error(`Cannot assign beds to a ${order.status} order`);
      }

      if (bedIds.length > 0) {
        const conflicts = db
          .select({ bedId: orderBeds.bedId, orderNo: productionOrders.orderNo })
          .from(orderBeds)
          .innerJoin(productionOrders, eq(orderBeds.orderId, productionOrders.id))
          .where(
            and(
              inArray(orderBeds.bedId, bedIds),
              eq(productionOrders.status, "in_progress"),
              ne(productionOrders.id, orderId)
            )
          )
          .all();
        if (conflicts.length > 0) {
          const taken = db
            .select({ code: beds.code })
            .from(beds)
            .where(inArray(beds.id, conflicts.map((c) => c.bedId)))
            .all();
          throw new Error(
            `Bed(s) ${taken.map((t) => t.code).join(", ")} already occupied by ${conflicts[0].orderNo}`
          );
        }
      }

      // Diff against the current assignment rather than delete+reinsert
      // everything, so beds that stay assigned keep their original
      // assignedAt (and therefore an accurate "days in bed" on the map).
      const current = db
        .select({ bedId: orderBeds.bedId })
        .from(orderBeds)
        .where(eq(orderBeds.orderId, orderId))
        .all()
        .map((r) => r.bedId);

      const toRemove = current.filter((id) => !bedIds.includes(id));
      const toAdd = bedIds.filter((id) => !current.includes(id));

      if (toRemove.length > 0) {
        db.delete(orderBeds)
          .where(and(eq(orderBeds.orderId, orderId), inArray(orderBeds.bedId, toRemove)))
          .run();
      }
      if (toAdd.length > 0) {
        db.insert(orderBeds)
          .values(toAdd.map((bedId) => ({ orderId, bedId })))
          .run();
      }

      writeAudit({
        actorId: user.id,
        action: "production_order.assign_beds",
        entity: "order_beds",
        entityId: orderId,
        after: { bedIds },
      });
    });

    revalidatePath("/layout-map");
    revalidatePath("/production");
    revalidatePath(`/production/${orderId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
