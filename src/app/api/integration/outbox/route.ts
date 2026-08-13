import { NextResponse } from "next/server";
import { asc, gt } from "drizzle-orm";
import { db } from "@/db";
import { erpOutboxEvents } from "@/db/schema";
import { verifyIntegrationRequest } from "@/lib/integration-auth";

// Append-only, no "processed" flag — idempotency/cursor tracking lives
// entirely in the integration service's own storage, not here.
export async function GET(request: Request) {
  if (!verifyIntegrationRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const afterId = Number(url.searchParams.get("afterId") ?? "0") || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100") || 100, 500);

  const rows = await db
    .select()
    .from(erpOutboxEvents)
    .where(gt(erpOutboxEvents.id, afterId))
    .orderBy(asc(erpOutboxEvents.id))
    .limit(limit);

  return NextResponse.json({ events: rows });
}
