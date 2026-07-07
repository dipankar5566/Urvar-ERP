// Seeds the two bed zones and 27 beds (Z1-01…Z1-12, Z2-01…Z2-15) with exact
// centerline coordinates extracted from the surveyed site plan PDF's vector
// data (Kisanbandhu Vermicompost-Model.pdf) — not an approximated grid.
//
// Extraction method: the PDF's green/red line objects were pulled via
// PyMuPDF, then mapped from PDF-space to the plot's feet-space using an
// affine transform solved from 7 matched boundary points (F,G,H,I,J,K,L),
// verified to <0.03ft residual. See PLOT_BOUNDARY in site-geometry.ts for
// the same boundary in feet.
//
// Idempotent: skips if zones already exist.

import { eq } from "drizzle-orm";
import { db } from "./index";
import { zones, beds, warehouses } from "./schema";

const BED_WIDTH_FT = 4;

// Zone 1 (green, 12 beds): 8 roughly E-W rows + 4 diagonal rows following
// the 132' edge.
const ZONE1_LINES = [
  { code: "Z1-01", x1: 56.58, y1: 115.1, x2: 186.63, y2: 114.93, lengthFt: 130.05 },
  { code: "Z1-02", x1: 43.87, y1: 114.86, x2: -26.27, y2: 40.68, lengthFt: 102.09 },
  { code: "Z1-03", x1: 49.63, y1: 106.45, x2: -20.51, y2: 32.26, lengthFt: 102.09 },
  { code: "Z1-04", x1: 56.17, y1: 105.19, x2: 186.73, y2: 105.13, lengthFt: 130.56 },
  { code: "Z1-05", x1: 49.76, y1: 95.23, x2: -13.25, y2: 26.97, lengthFt: 92.9 },
  { code: "Z1-06", x1: 55.96, y1: 94.28, x2: 187.02, y2: 93.76, lengthFt: 131.06 },
  { code: "Z1-07", x1: 51.45, y1: 82.06, x2: -5.88, y2: 20.63, lengthFt: 84.03 },
  { code: "Z1-08", x1: 56.58, y1: 81.71, x2: 187.75, y2: 81.78, lengthFt: 131.17 },
  { code: "Z1-09", x1: 56.29, y1: 69.52, x2: 187.69, y2: 69.94, lengthFt: 131.4 },
  { code: "Z1-10", x1: 55.79, y1: 56.87, x2: 187.7, y2: 57.51, lengthFt: 131.92 },
  { code: "Z1-11", x1: 55.04, y1: 46.45, x2: 187.59, y2: 46.79, lengthFt: 132.54 },
  { code: "Z1-12", x1: 47.71, y1: 35.72, x2: 179.71, y2: 37.26, lengthFt: 132.01 },
];

// Zone 2 (red, 15 beds): 12 long rows (89.73') + 3 shorter offset rows (59.47').
const ZONE2_LINES = [
  { code: "Z2-01", x1: 67.59, y1: -23.21, x2: -22.06, y2: -19.47, lengthFt: 89.73 },
  { code: "Z2-02", x1: 67.62, y1: -30.11, x2: -22.04, y2: -26.37, lengthFt: 89.73 },
  { code: "Z2-03", x1: 69.02, y1: -37.05, x2: -20.64, y2: -33.31, lengthFt: 89.73 },
  { code: "Z2-04", x1: 71.29, y1: -43.9, x2: -18.37, y2: -40.16, lengthFt: 89.73 },
  { code: "Z2-05", x1: 76.67, y1: -50.32, x2: -12.99, y2: -46.59, lengthFt: 89.73 },
  { code: "Z2-06", x1: 83.09, y1: -57.01, x2: -6.57, y2: -53.27, lengthFt: 89.73 },
  { code: "Z2-07", x1: 89.51, y1: -64.47, x2: -0.14, y2: -60.73, lengthFt: 89.73 },
  { code: "Z2-08", x1: 95.41, y1: -71.41, x2: 5.76, y2: -67.67, lengthFt: 89.73 },
  { code: "Z2-09", x1: 3.3, y1: -73.48, x2: -56.13, y2: -71.27, lengthFt: 59.47 },
  { code: "Z2-10", x1: 99.4, y1: -79.2, x2: 9.74, y2: -75.46, lengthFt: 89.73 },
  { code: "Z2-11", x1: 3.4, y1: -80.59, x2: -56.02, y2: -78.38, lengthFt: 59.47 },
  { code: "Z2-12", x1: 104.35, y1: -87.61, x2: 14.69, y2: -83.87, lengthFt: 89.73 },
  { code: "Z2-13", x1: 5.93, y1: -88.31, x2: -53.5, y2: -86.1, lengthFt: 59.47 },
  { code: "Z2-14", x1: 111.03, y1: -94.99, x2: 21.37, y2: -91.25, lengthFt: 89.73 },
  { code: "Z2-15", x1: 116.32, y1: -102.71, x2: 26.67, y2: -98.97, lengthFt: 89.73 },
];

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

  db.insert(beds)
    .values(
      ZONE1_LINES.map((l) => ({
        zoneId: z1.id,
        code: l.code,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        widthFt: BED_WIDTH_FT,
        lengthFt: l.lengthFt,
      }))
    )
    .run();

  db.insert(beds)
    .values(
      ZONE2_LINES.map((l) => ({
        zoneId: z2.id,
        code: l.code,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        widthFt: BED_WIDTH_FT,
        lengthFt: l.lengthFt,
      }))
    )
    .run();

  console.log(`Seeded 2 zones and ${ZONE1_LINES.length + ZONE2_LINES.length} beds (exact site-plan replica).`);
}

seedBeds().catch((e) => {
  console.error(e);
  process.exit(1);
});
