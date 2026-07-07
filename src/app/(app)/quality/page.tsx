import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getLotsForInspection, getBatchesForQC, getCapas } from "@/modules/quality/queries";
import { QualityView } from "./quality-view";

export default async function QualityPage() {
  await requireUser();

  const lots = getLotsForInspection();
  const batches = getBatchesForQC();
  const capas = getCapas();
  const userRows = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name))
    .all();

  return <QualityView lots={lots} batches={batches} capas={capas} users={userRows} />;
}
