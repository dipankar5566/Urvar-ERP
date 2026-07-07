// Kisanbandhu plot geometry, extracted from the surveyed site plan
// (Kisanbandhu Vermicompost.dwg, drawing units = inches, converted to feet).
// Coordinates are in feet; y increases northward (flip for SVG).

export type Pt = [number, number];

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

export const BED_LENGTH_FT = 70;
export const BED_WIDTH_FT = 4;
export const BED_GAP_FT = 3;

// Tree-line dividers between Zone 1 beds (visual only — not tracked master
// data). One line in the middle of each 3' gap between the 10 beds, per the
// updated site plan.
const Z1_BED_TOP_Y = 115;
const Z1_PITCH = BED_WIDTH_FT + BED_GAP_FT; // 7'
const Z1_BED_X0 = 60;
export const ZONE1_TREE_LINES: [Pt, Pt][] = Array.from({ length: 9 }, (_, i) => {
  const y = Z1_BED_TOP_Y - i * Z1_PITCH - BED_WIDTH_FT - BED_GAP_FT / 2;
  return [
    [Z1_BED_X0, y],
    [Z1_BED_X0 + BED_LENGTH_FT, y],
  ] as [Pt, Pt];
});

// Machine Shed & Godown, positioned near the Zone 1 / Zone 2 boundary
// (the L–F internal line) per the updated site plan.
export const MACHINE_SHED_RECT: Pt[] = [
  [-35, 20],
  [5, 20],
  [5, 0],
  [-35, 0],
];
