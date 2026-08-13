import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getLotsForInspection, getBatchesForQC, getCapas } from "@/modules/quality/queries";
import { QualityView } from "./quality-view";

export default async function QualityPage() {
  await requireUser();

  const lots = await getLotsForInspection();
  const batches = await getBatchesForQC();
  const capas = await getCapas();
  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));

  return <QualityView lots={lots} batches={batches} capas={capas} users={userRows} />;
}
