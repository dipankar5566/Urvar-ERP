// Shared 2D geometry for the site-layout editor — used by BOTH the client
// editor (live overlap/zone warnings while dragging) and the save action
// (server-side re-validation; never trust the client's checks). Plain
// module, no "use client"/"use server". All coordinates are site-plan feet.

import type { Pt } from "./types";

// Ray-casting point-in-polygon (non-zero winding not needed — site polygons
// are simple).
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// A bed is a centerline segment + width; its footprint is the rotated
// rectangle formed by offsetting both endpoints perpendicular to the
// segment by half the width. Same math the map renderer uses.
export function bedQuad(b: { x1: number; y1: number; x2: number; y2: number; widthFt: number }): Pt[] {
  const dx = b.x2 - b.x1;
  const dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (b.widthFt / 2);
  const py = (dx / len) * (b.widthFt / 2);
  return [
    [b.x1 + px, b.y1 + py],
    [b.x2 + px, b.y2 + py],
    [b.x2 - px, b.y2 - py],
    [b.x1 - px, b.y1 - py],
  ];
}

export function segmentLength(b: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
}

export function centroid(poly: Pt[]): Pt {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of poly) {
    sx += x;
    sy += y;
  }
  return [sx / poly.length, sy / poly.length];
}

// Separating Axis Theorem for two CONVEX polygons (bed quads and the
// axis-aligned structure rectangles both qualify). Touching edges don't
// count as overlap — beds legitimately sit flush side by side.
export function convexPolygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      // Edge normal as the candidate separating axis.
      const nx = y2 - y1;
      const ny = x1 - x2;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [px, py] of a) {
        const proj = px * nx + py * ny;
        minA = Math.min(minA, proj);
        maxA = Math.max(maxA, proj);
      }
      for (const [px, py] of b) {
        const proj = px * nx + py * ny;
        minB = Math.min(minB, proj);
        maxB = Math.max(maxB, proj);
      }
      const EPS = 1e-6;
      if (maxA <= minB + EPS || maxB <= minA + EPS) return false;
    }
  }
  return true;
}

// True when every vertex is finite and the polygon has enough of them to
// enclose area — the save action's minimum bar for stored geometry.
export function isValidPolygon(poly: Pt[]): boolean {
  return (
    poly.length >= 3 &&
    poly.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  );
}

function orient(a: Pt, b: Pt, c: Pt): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const EPS = 1e-9;
  return v > EPS ? 1 : v < -EPS ? -1 : 0;
}

// Strict ("proper") crossing — segments that merely touch at an endpoint or
// run collinear don't count, so legitimately flush geometry doesn't trip it.
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

// A polygon whose edges cross each other (a "bowtie") has no well-defined
// inside — point-in-polygon, zone auto-detection, and area all break on it,
// so the save action rejects these outright (hard error, unlike the
// overlap warnings). Adjacent edges share a vertex and are skipped.
export function isSelfIntersecting(poly: Pt[]): boolean {
  const n = poly.length;
  if (n < 4) return false; // triangles can't self-intersect
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip the edge itself and the two edges sharing a vertex with it.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}
