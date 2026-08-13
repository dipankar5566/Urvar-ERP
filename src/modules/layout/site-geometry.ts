// Tantipara plot geometry, extracted from the surveyed site plan
// (Kisanbandhu Vermicompost.dwg, drawing units = inches, converted to feet).
// Coordinates are in feet; y increases northward (flip for SVG).
//
// SEED SOURCE ONLY — since the Phase A site-layout refactor, the map
// renders from the database (zones.polygon + site_features), not these
// constants. They remain as the canonical surveyed values for fresh-DB
// seeding (seed-beds.ts) and the 0011 backfill migration. Editing them
// does NOT change an existing installation's map.

import type { Pt } from "./types";
export type { Pt };

// Outer boundary, counter-clockwise from the top-left corner of the 160' edge.
// Edge lengths: 160' (top) → 84' → 90' → 74'-2" → 100' → 70' → ~221' (strip)
// → 70' (bottom) → 145' → 127'-11½" → 132' back to start.
export const PLOT_BOUNDARY: Pt[] = [
  [44.43, 124.95], // A — 132'/160' corner
  [204.43, 124.64], // C — 160'/84' corner
  [212.71, 41.05], // D — 84'/90' corner
  [125.6, 18.43], // E — 90'/74'-2" corner
  [69.22, -29.79], // F — 74'-2"/100' junction
  [133.23, -106.63], // G — 100'/70' corner
  [184.0, -154.82], // H — 70'/strip corner
  [13.65, -296.18], // I — strip tip
  [-21.97, -235.92], // J — bottom-70'/145' corner
  [-64.7, -97.36], // K — 145'/127'-11½" corner
  [-46.56, 29.32], // L — 127'-11½"/132' corner
];

// Zone 1 (marked green on the plan): the upper section, closed by the
// internal line L→F.
export const ZONE1_POLY: Pt[] = [
  [-46.56, 29.32], // L
  [44.43, 124.95], // A
  [204.43, 124.64], // C
  [212.71, 41.05], // D
  [125.6, 18.43], // E
  [69.22, -29.79], // F
];

// Zone 2 (marked red): the central section between the internal line and
// the strip, bounded left by the 145' / 127'-11½" edges.
export const ZONE2_POLY: Pt[] = [
  [-46.56, 29.32], // L
  [69.22, -29.79], // F
  [133.23, -106.63], // G
  [-21.97, -235.92], // J
  [-64.7, -97.36], // K
];

// Map-label anchor points (formerly hardcoded in the map renderer).
export const ZONE1_LABEL: Pt = [150, 108];
export const ZONE2_LABEL: Pt = [-58, -190];

// The narrow access strip at the bottom (not a bed zone) — drawn for context.
export const STRIP_POLY: Pt[] = [
  [133.23, -106.63], // G
  [184.0, -154.82], // H
  [13.65, -296.18], // I
  [-21.97, -235.92], // J
];

// Internal 108'-2" diagonal in Zone 1 (context line on the plan).
export const ZONE1_DIAGONAL: [Pt, Pt] = [
  [144.43, 124.95],
  [125.6, 18.43],
];

// Beds themselves are stored per-bed in the database (src/db/seed-beds.ts)
// as exact centerline segments extracted from the site plan's vector data —
// not a formulaic grid. These constants remain only for reference.
export const BED_WIDTH_FT = 4;

// Machine Shed & Godown, positioned near the Zone 1 / Zone 2 boundary
// (the L–F internal line) per the updated site plan. Shifted 8ft south
// (y -8) from its original placement to keep clear of nearby Zone 1 beds,
// while staying well north of the nearest Zone 2 bed (Z2-01 starts around
// y=-19 to -23). Beds were later trimmed to a uniform 70'/50' operating
// length (see seed-beds.ts) which only pulled bed ends further from the
// shed, so this clearance holds with more margin than when it was set.
// Sized to 1000 sqft (50' x 20') — widened 5ft each side from the original
// 40' width about the same center; the 20' height (and its y-clearance
// margins above/below) is unchanged.
export const MACHINE_SHED_RECT: Pt[] = [
  [-40, 12],
  [10, 12],
  [10, -8],
  [-40, -8],
];
