// Seeds the site geometry: two bed zones (with their outline polygons),
// 27 beds (Z1-01…Z1-12, Z2-01…Z2-15), and the site features (plot
// boundary, access strip, Machine Shed & Godown). Bed centerlines are
// exact coordinates extracted from the surveyed site plan PDF's vector
// data (Kisanbandhu Vermicompost-Model.pdf) — not an approximated grid.
//
// Extraction method: the PDF's green/red line objects were pulled via
// PyMuPDF, then mapped from PDF-space to the plot's feet-space using an
// affine transform solved from 7 matched boundary points (F,G,H,I,J,K,L),
// verified to <0.03ft residual. See PLOT_BOUNDARY in site-geometry.ts for
// the same boundary in feet.
//
// Idempotent: skips if zones already exist.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { zones, beds, warehouses, siteFeatures } from "./schema";
import {
  PLOT_BOUNDARY,
  STRIP_POLY,
  ZONE1_POLY,
  ZONE2_POLY,
  ZONE1_LABEL,
  ZONE2_LABEL,
  MACHINE_SHED_RECT,
} from "../modules/layout/site-geometry";

const BED_WIDTH_FT = 4;

// Zone 1 (green, 12 beds): 8 roughly E-W rows + 4 diagonal rows following
// the 132' edge. Centerlines are truncated to a uniform 70' operating
// length (down from the as-surveyed lengths, which ran up to 132'),
// shrunk symmetrically about each row's original midpoint so the beds
// stay centered in their surveyed position.
const ZONE1_LINES = [
  { code: "Z1-01", x1: 86.61, y1: 115.06, x2: 156.6, y2: 114.97, lengthFt: 70 },
  { code: "Z1-02", x1: 32.85, y1: 103.2, x2: -15.25, y2: 52.34, lengthFt: 70 },
  { code: "Z1-03", x1: 38.6, y1: 94.79, x2: -9.48, y2: 43.92, lengthFt: 70 },
  { code: "Z1-04", x1: 86.45, y1: 105.18, x2: 156.45, y2: 105.14, lengthFt: 70 },
  { code: "Z1-05", x1: 41.99, y1: 86.82, x2: -5.48, y2: 35.38, lengthFt: 70 },
  { code: "Z1-06", x1: 86.49, y1: 94.16, x2: 156.49, y2: 93.88, lengthFt: 70 },
  { code: "Z1-07", x1: 46.67, y1: 76.93, x2: -1.1, y2: 25.76, lengthFt: 70 },
  { code: "Z1-08", x1: 87.17, y1: 81.73, x2: 157.16, y2: 81.76, lengthFt: 70 },
  { code: "Z1-09", x1: 86.99, y1: 69.62, x2: 156.99, y2: 69.84, lengthFt: 70 },
  { code: "Z1-10", x1: 86.75, y1: 57.02, x2: 156.74, y2: 57.36, lengthFt: 70 },
  { code: "Z1-11", x1: 86.32, y1: 46.53, x2: 156.31, y2: 46.71, lengthFt: 70 },
  { code: "Z1-12", x1: 78.71, y1: 36.08, x2: 148.71, y2: 36.9, lengthFt: 70 },
];

// Zone 2 (red, 15 beds): uniform 50' operating length (down from the
// as-surveyed 89.73'/59.47' rows), shrunk symmetrically about each row's
// original midpoint.
const ZONE2_LINES = [
  { code: "Z2-01", x1: 47.74, y1: -22.38, x2: -2.21, y2: -20.3, lengthFt: 50 },
  { code: "Z2-02", x1: 47.77, y1: -29.28, x2: -2.19, y2: -27.2, lengthFt: 50 },
  { code: "Z2-03", x1: 49.17, y1: -36.22, x2: -0.79, y2: -34.14, lengthFt: 50 },
  { code: "Z2-04", x1: 51.44, y1: -43.07, x2: 1.48, y2: -40.99, lengthFt: 50 },
  { code: "Z2-05", x1: 56.82, y1: -49.49, x2: 6.86, y2: -47.42, lengthFt: 50 },
  { code: "Z2-06", x1: 63.24, y1: -56.18, x2: 13.28, y2: -54.1, lengthFt: 50 },
  { code: "Z2-07", x1: 69.66, y1: -63.64, x2: 19.71, y2: -61.56, lengthFt: 50 },
  { code: "Z2-08", x1: 75.56, y1: -70.58, x2: 25.61, y2: -68.5, lengthFt: 50 },
  { code: "Z2-09", x1: -1.43, y1: -73.3, x2: -51.4, y2: -71.45, lengthFt: 50 },
  { code: "Z2-10", x1: 79.55, y1: -78.37, x2: 29.59, y2: -76.29, lengthFt: 50 },
  { code: "Z2-11", x1: -1.33, y1: -80.41, x2: -51.29, y2: -78.56, lengthFt: 50 },
  { code: "Z2-12", x1: 84.5, y1: -86.78, x2: 34.54, y2: -84.7, lengthFt: 50 },
  { code: "Z2-13", x1: 1.2, y1: -88.13, x2: -48.77, y2: -86.28, lengthFt: 50 },
  { code: "Z2-14", x1: 91.18, y1: -94.16, x2: 41.22, y2: -92.08, lengthFt: 50 },
  { code: "Z2-15", x1: 96.47, y1: -101.88, x2: 46.52, y2: -99.8, lengthFt: 50 },
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

  // Boundary, access strip, and structures — the map renders these from
  // the DB (Phase A refactor), so a fresh install needs them seeded.
  const existingFeatures = db.select().from(siteFeatures).limit(1).all();
  if (existingFeatures.length === 0) {
    const shed = db
      .select()
      .from(warehouses)
      .where(eq(warehouses.name, "Machine Shed & Godown"))
      .get();
    db.insert(siteFeatures)
      .values([
        { kind: "boundary", label: "Plot boundary", polygon: JSON.stringify(PLOT_BOUNDARY) },
        { kind: "strip", label: "Access strip", polygon: JSON.stringify(STRIP_POLY) },
        {
          kind: "structure",
          structureType: "godown",
          label: "Machine Shed & Godown",
          polygon: JSON.stringify(MACHINE_SHED_RECT),
          warehouseId: shed?.id ?? null,
        },
      ])
      .run();
    console.log("Seeded site features (boundary, strip, Machine Shed).");
  } else {
    // Fresh installs hit migration 0011 before this seed runs, so the
    // Machine Shed feature exists but couldn't link to the warehouse row
    // (seeded above, after migrations). Repair the link idempotently.
    const shed = db
      .select()
      .from(warehouses)
      .where(eq(warehouses.name, "Machine Shed & Godown"))
      .get();
    if (shed) {
      db.update(siteFeatures)
        .set({ warehouseId: shed.id })
        .where(
          and(eq(siteFeatures.label, "Machine Shed & Godown"), isNull(siteFeatures.warehouseId))
        )
        .run();
    }
  }

  const existing = db.select().from(zones).limit(1).all();
  if (existing.length > 0) {
    console.log("Zones already seeded — skipping.");
    return;
  }

  const [z1, z2] = db
    .insert(zones)
    .values([
      {
        code: "Z1",
        name: "Zone 1",
        polygon: JSON.stringify(ZONE1_POLY),
        labelX: ZONE1_LABEL[0],
        labelY: ZONE1_LABEL[1],
      },
      {
        code: "Z2",
        name: "Zone 2",
        polygon: JSON.stringify(ZONE2_POLY),
        labelX: ZONE2_LABEL[0],
        labelY: ZONE2_LABEL[1],
      },
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
