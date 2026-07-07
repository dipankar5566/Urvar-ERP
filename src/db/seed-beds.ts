// Seeds the two bed zones and 25 beds (Z1-01…Z1-10, Z2-01…Z2-15) with
// positions fitted inside the zone polygons from the site plan.
// Idempotent: skips if zones already exist.

import { eq } from "drizzle-orm";
import { db } from "./index";
import { zones, beds, warehouses } from "./schema";
import { BED_LENGTH_FT, BED_WIDTH_FT, BED_GAP_FT } from "../modules/layout/site-geometry";

const PITCH = BED_WIDTH_FT + BED_GAP_FT; // 7'

async function seedBeds() {
  const existingShed = db
    .select()
    .from(warehouses)
    .where(eq(warehouses.name, "Machine Shed & Godown"))
    .get();
  if (!existingShed) {
    db.insert(warehouses)
      .values({ name: "Machine Shed & Godown", location: "Kisanbandhu Plant — near Zone 1/2 boundary" })
      .run();
    console.log("Seeded Machine Shed & Godown warehouse.");
  }

  const existing = db.select().from(zones).limit(1).all();
  if (existing.length > 0) {
    console.log("Zones already seeded — skipping.");
    return;
  }

  const [z1, z2] = db
    .insert(zones)
    .values([
      { code: "Z1", name: "Zone 1" },
      { code: "Z2", name: "Zone 2" },
    ])
    .returning()
    .all();

  // Zone 1: 10 beds, length E-W (horizontal), stacked N→S.
  // Block spans x 75→145, top bed at y=95 down to y=28.
  const z1Beds = Array.from({ length: 10 }, (_, i) => ({
    zoneId: z1.id,
    code: `Z1-${String(i + 1).padStart(2, "0")}`,
    lengthFt: BED_LENGTH_FT,
    widthFt: BED_WIDTH_FT,
    posX: 75,
    posY: 95 - i * PITCH, // top edge of each bed
    orientation: "h" as const,
  }));

  // Zone 2: 15 beds, length N-S (vertical), side by side W→E.
  // Block spans y -140→-70 (70' tall), first bed at x=-30.
  const z2Beds = Array.from({ length: 15 }, (_, i) => ({
    zoneId: z2.id,
    code: `Z2-${String(i + 1).padStart(2, "0")}`,
    lengthFt: BED_LENGTH_FT,
    widthFt: BED_WIDTH_FT,
    posX: -30 + i * PITCH,
    posY: -70, // top edge; bed runs south to -140
    orientation: "v" as const,
  }));

  db.insert(beds).values([...z1Beds, ...z2Beds]).run();
  console.log("Seeded 2 zones and 25 beds.");
}

seedBeds().catch((e) => {
  console.error(e);
  process.exit(1);
});
