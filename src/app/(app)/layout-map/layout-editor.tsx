"use client";

// Admin-only, desktop-only draft editor for the site layout (Phase B of the
// self-service layout plan). All edits accumulate client-side and persist in
// ONE atomic save (saveLayoutEdits) — Cancel is a free undo-all. There are
// no per-object dialogs: placing a bed/structure creates it immediately with
// sensible defaults (auto zone by point-in-polygon, next free code, 4ft
// width) and the properties panel is the editing surface.

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Hexagon, MousePointer2, Minus, Square, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form-dialog";
import type { BedLayout } from "@/modules/layout/queries";
import { saveLayoutEdits } from "@/modules/layout/actions";
import {
  bedQuad,
  centroid,
  convexPolygonsOverlap,
  isSelfIntersecting,
  pointInPolygon,
  segmentLength,
} from "@/modules/layout/geometry";
import type { Pt } from "@/modules/layout/types";
import type { Warehouse } from "@/modules/masters/types";
import { ZONE_STYLES, splitLabel } from "./layout-view";

const PAD = 14;
const SCALE = 2.4;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const STRUCTURE_TYPES = ["shed", "godown", "tank", "office", "other"] as const;
type StructureType = (typeof STRUCTURE_TYPES)[number];

type DraftBed = {
  key: string;
  id?: number;
  code: string;
  zoneId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthFt: number;
  occupied: boolean;
};

type DraftStructure = {
  key: string;
  id?: number;
  label: string;
  structureType: StructureType;
  warehouseId: number | null;
  polygon: Pt[];
};

// Zones and the plot boundary/strip are reshaped vertex-by-vertex (Phase C).
type DraftZone = {
  key: string;
  id?: number;
  code: string;
  name: string;
  polygon: Pt[];
  labelX: number;
  labelY: number;
};

type DraftShape = {
  key: string;
  id: number;
  kind: "boundary" | "strip";
  label: string;
  polygon: Pt[];
};

type Tool = "select" | "bed" | "structure" | "zones";

type Drag =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; key: string; isBed: boolean; lastFeet: Pt }
  | { kind: "bedEnd"; key: string; end: 1 | 2 }
  | { kind: "corner"; key: string; anchor: Pt }
  | { kind: "structDraw"; start: Pt }
  | { kind: "vertex"; key: string; idx: number }
  | { kind: "label"; key: string }
  | null;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function LayoutEditor({
  layout,
  warehouses,
  onExit,
}: {
  layout: BedLayout;
  warehouses: Warehouse[];
  onExit: () => void;
}) {
  // --- Draft state (initialized once from props; polls don't reset it) ----
  const [dBeds, setDBeds] = useState<DraftBed[]>(() =>
    layout.beds.map((b) => ({
      key: `b${b.id}`,
      id: b.id,
      code: b.code,
      zoneId: b.zoneId,
      x1: b.x1,
      y1: b.y1,
      x2: b.x2,
      y2: b.y2,
      widthFt: b.widthFt,
      occupied: !!b.occupant,
    }))
  );
  const [dStructs, setDStructs] = useState<DraftStructure[]>(() =>
    layout.features
      .filter((f) => f.kind === "structure")
      .map((f) => ({
        key: `s${f.id}`,
        id: f.id,
        label: f.label ?? "Structure",
        structureType: (f.structureType ?? "other") as StructureType,
        warehouseId: f.warehouseId,
        polygon: f.polygonPts,
      }))
  );
  const [dZones, setDZones] = useState<DraftZone[]>(() =>
    layout.zones
      .filter((z) => z.polygonPts)
      .map((z) => ({
        key: `z${z.id}`,
        id: z.id,
        code: z.code,
        name: z.name,
        polygon: z.polygonPts!,
        labelX: z.labelPt ? z.labelPt[0] : r2(centroid(z.polygonPts!)[0]),
        labelY: z.labelPt ? z.labelPt[1] : r2(centroid(z.polygonPts!)[1]),
      }))
  );
  const [dShapes, setDShapes] = useState<DraftShape[]>(() =>
    layout.features
      .filter((f) => f.kind === "boundary" || f.kind === "strip")
      .map((f) => ({
        key: `f${f.id}`,
        id: f.id,
        kind: f.kind as "boundary" | "strip",
        label: f.label ?? f.kind,
        polygon: f.polygonPts,
      }))
  );
  const [retireBedIds, setRetireBedIds] = useState<number[]>([]);
  const [retireStructureIds, setRetireStructureIds] = useState<number[]>([]);
  const newCounter = useRef(0);

  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<Pt | null>(null);
  const [cursorFeet, setCursorFeet] = useState<Pt | null>(null);
  const [drawRect, setDrawRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const [drawingZone, setDrawingZone] = useState<Pt[] | null>(null);
  const [saving, startSaving] = useTransition();

  // --- Projection (same math as the viewer) --------------------------------
  const boundaryJson = layout.features.find((f) => f.kind === "boundary")?.polygon ?? "[]";
  const { W, H, px, poly, toFeet } = useMemo(() => {
    const pts = JSON.parse(boundaryJson) as Pt[];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = pts.length ? Math.min(...xs) : 0;
    const maxY = pts.length ? Math.max(...ys) : 0;
    const W = pts.length ? (Math.max(...xs) - minX) * SCALE + PAD * 2 : 100;
    const H = pts.length ? (maxY - Math.min(...ys)) * SCALE + PAD * 2 : 100;
    const px = (p: Pt): [number, number] => [(p[0] - minX) * SCALE + PAD, (maxY - p[1]) * SCALE + PAD];
    const poly = (points: Pt[]) => points.map((p) => px(p).join(",")).join(" ");
    const toFeet = (vx: number, vy: number): Pt => [(vx - PAD) / SCALE + minX, maxY - (vy - PAD) / SCALE];
    return { W, H, px, poly, toFeet };
  }, [boundaryJson]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const drag = useRef<Drag>(null);
  const moved = useRef(0);

  function clampView(v: { k: number; tx: number; ty: number }) {
    if (v.k <= MIN_ZOOM) return { k: MIN_ZOOM, tx: 0, ty: 0 };
    return {
      k: Math.min(v.k, MAX_ZOOM),
      tx: Math.min(0, Math.max(W - W * v.k, v.tx)),
      ty: Math.min(0, Math.max(H - H * v.k, v.ty)),
    };
  }

  function zoomCentered(factor: number) {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      const f = k / v.k;
      return clampView({ k, tx: W / 2 - (W / 2 - v.tx) * f, ty: H / 2 - (H / 2 - v.ty) * f });
    });
  }

  function clientToFeet(clientX: number, clientY: number): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) * W) / rect.width;
    const vy = ((clientY - rect.top) * H) / rect.height;
    return toFeet((vx - view.tx) / view.k, (vy - view.ty) / view.k);
  }

  // --- Draft helpers --------------------------------------------------------
  // Persisted zones only (a bed can't reference a zone id that doesn't
  // exist yet — new draft zones become assignable after the save).
  const persistedZones = dZones.filter((z) => z.id);

  function detectZone(p: Pt): number {
    for (const z of persistedZones) {
      if (pointInPolygon(p, z.polygon)) return z.id!;
    }
    // Outside every zone: nearest zone centroid, so the new bed is at least
    // attached somewhere sensible (the panel lets the admin change it).
    let best = persistedZones[0]?.id ?? 0;
    let bestD = Infinity;
    for (const z of persistedZones) {
      const c = centroid(z.polygon);
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = z.id!;
      }
    }
    return best;
  }

  function nextCode(zoneId: number): string {
    const prefix = `${persistedZones.find((z) => z.id === zoneId)?.code ?? "Z?"}-`;
    let max = 0;
    for (const b of dBeds) {
      if (b.code.startsWith(prefix)) {
        const n = parseInt(b.code.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    return `${prefix}${String(max + 1).padStart(2, "0")}`;
  }

  // Parallel snapping: align a drawn segment to the nearest existing bed's
  // direction — how real bed rows are added in the field.
  function snapEnd(start: Pt, end: Pt): Pt {
    if (!snap || dBeds.length === 0) return end;
    const mid: Pt = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    let best: DraftBed | null = null;
    let bestD = 80; // ft — beyond this, snapping would surprise more than help
    for (const b of dBeds) {
      const d = Math.hypot((b.x1 + b.x2) / 2 - mid[0], (b.y1 + b.y2) / 2 - mid[1]);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return end;
    const L = segmentLength(best) || 1;
    const ux = (best.x2 - best.x1) / L;
    const uy = (best.y2 - best.y1) / L;
    const proj = (end[0] - start[0]) * ux + (end[1] - start[1]) * uy;
    return [start[0] + ux * proj, start[1] + uy * proj];
  }

  function updateBed(key: string, patch: Partial<DraftBed>) {
    setDBeds((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function updateStruct(key: string, patch: Partial<DraftStructure>) {
    setDStructs((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function updateZone(key: string, patch: Partial<DraftZone>) {
    setDZones((prev) => prev.map((z) => (z.key === key ? { ...z, ...patch } : z)));
  }

  // Vertex operations apply to whichever draft (zone or boundary/strip)
  // holds the key — keys are unique across both arrays.
  function updatePolygonByKey(key: string, fn: (poly: Pt[]) => Pt[]) {
    setDZones((prev) => prev.map((z) => (z.key === key ? { ...z, polygon: fn(z.polygon) } : z)));
    setDShapes((prev) => prev.map((s) => (s.key === key ? { ...s, polygon: fn(s.polygon) } : s)));
  }

  function removeVertexAt(key: string, idx: number) {
    // A polygon needs at least 3 vertices to enclose area.
    updatePolygonByKey(key, (poly) => (poly.length > 3 ? poly.filter((_, i) => i !== idx) : poly));
  }

  function finishZoneDrawing() {
    if (!drawingZone || drawingZone.length < 3) return;
    let maxN = 0;
    for (const z of dZones) {
      const m = /^Z(\d+)$/.exec(z.code);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const c = centroid(drawingZone);
    const key = `new-z${++newCounter.current}`;
    setDZones((prev) => [
      ...prev,
      {
        key,
        code: `Z${maxN + 1}`,
        name: `Zone ${maxN + 1}`,
        polygon: drawingZone,
        labelX: r2(c[0]),
        labelY: r2(c[1]),
      },
    ]);
    setDrawingZone(null);
    setSelectedKey(key);
  }

  function addBed(start: Pt, endRaw: Pt) {
    const end = snapEnd(start, endRaw);
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 2) return; // accidental click
    const mid: Pt = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const zoneId = detectZone(mid);
    const key = `new-b${++newCounter.current}`;
    setDBeds((prev) => [
      ...prev,
      {
        key,
        code: nextCode(zoneId),
        zoneId,
        x1: r2(start[0]),
        y1: r2(start[1]),
        x2: r2(end[0]),
        y2: r2(end[1]),
        widthFt: 4,
        occupied: false,
      },
    ]);
    setSelectedKey(key);
    setTool("select");
    setPendingStart(null);
  }

  function addStructure(a: Pt, b: Pt) {
    const w = Math.abs(a[0] - b[0]);
    const h = Math.abs(a[1] - b[1]);
    if (w < 4 || h < 4) return; // accidental drag
    const minXf = r2(Math.min(a[0], b[0]));
    const maxXf = r2(Math.max(a[0], b[0]));
    const minYf = r2(Math.min(a[1], b[1]));
    const maxYf = r2(Math.max(a[1], b[1]));
    const key = `new-s${++newCounter.current}`;
    setDStructs((prev) => [
      ...prev,
      {
        key,
        label: "New structure",
        structureType: "shed",
        warehouseId: null,
        polygon: [
          [minXf, maxYf],
          [maxXf, maxYf],
          [maxXf, minYf],
          [minXf, minYf],
        ],
      },
    ]);
    setSelectedKey(key);
    setTool("select");
  }

  function removeSelected() {
    if (!selectedKey) return;
    const bed = dBeds.find((b) => b.key === selectedKey);
    if (bed) {
      if (bed.occupied) return;
      if (bed.id) setRetireBedIds((prev) => [...prev, bed.id!]);
      setDBeds((prev) => prev.filter((b) => b.key !== selectedKey));
    }
    const st = dStructs.find((s) => s.key === selectedKey);
    if (st) {
      if (st.id) setRetireStructureIds((prev) => [...prev, st.id!]);
      setDStructs((prev) => prev.filter((s) => s.key !== selectedKey));
    }
    // Only never-saved zones can be dropped — persisted zones have no
    // retire path (beds reference them; deactivation is out of scope).
    const zn = dZones.find((z) => z.key === selectedKey);
    if (zn && !zn.id) {
      setDZones((prev) => prev.filter((z) => z.key !== selectedKey));
    }
    setSelectedKey(null);
  }

  // --- Pointer handling -----------------------------------------------------
  // NB: never setPointerCapture on the SVG — it retargets click events away
  // from child elements (see the viewer's comment / verify-skill gotcha).
  function onSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    moved.current = 0;
    const feet = clientToFeet(e.clientX, e.clientY);
    if (tool === "structure") {
      drag.current = { kind: "structDraw", start: feet };
      setDrawRect({ a: feet, b: feet });
    } else if (
      (tool === "select" || (tool === "zones" && !drawingZone)) &&
      drag.current === null &&
      view.k > 1
    ) {
      drag.current = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
    }
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const feet = clientToFeet(e.clientX, e.clientY);
    if (tool === "bed" || (tool === "zones" && drawingZone)) setCursorFeet(feet);
    const d = drag.current;
    if (!d) return;
    moved.current += Math.abs(e.movementX) + Math.abs(e.movementY);

    if (d.kind === "pan") {
      const rect = svgRef.current!.getBoundingClientRect();
      const toView = W / rect.width;
      const dx = (e.clientX - d.lastX) * toView;
      const dy = (e.clientY - d.lastY) * toView;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      setView((v) => clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    } else if (d.kind === "structDraw") {
      setDrawRect({ a: d.start, b: feet });
    } else if (d.kind === "move") {
      const dx = feet[0] - d.lastFeet[0];
      const dy = feet[1] - d.lastFeet[1];
      d.lastFeet = feet;
      if (d.isBed) {
        setDBeds((prev) =>
          prev.map((b) =>
            b.key === d.key
              ? { ...b, x1: r2(b.x1 + dx), y1: r2(b.y1 + dy), x2: r2(b.x2 + dx), y2: r2(b.y2 + dy) }
              : b
          )
        );
      } else {
        setDStructs((prev) =>
          prev.map((s) =>
            s.key === d.key
              ? { ...s, polygon: s.polygon.map((p) => [r2(p[0] + dx), r2(p[1] + dy)] as Pt) }
              : s
          )
        );
      }
    } else if (d.kind === "bedEnd") {
      const p: Pt = [r2(feet[0]), r2(feet[1])];
      setDBeds((prev) =>
        prev.map((b) =>
          b.key === d.key ? (d.end === 1 ? { ...b, x1: p[0], y1: p[1] } : { ...b, x2: p[0], y2: p[1] }) : b
        )
      );
    } else if (d.kind === "corner") {
      const minXf = r2(Math.min(d.anchor[0], feet[0]));
      const maxXf = r2(Math.max(d.anchor[0], feet[0]));
      const minYf = r2(Math.min(d.anchor[1], feet[1]));
      const maxYf = r2(Math.max(d.anchor[1], feet[1]));
      if (maxXf - minXf < 2 || maxYf - minYf < 2) return;
      setDStructs((prev) =>
        prev.map((s) =>
          s.key === d.key
            ? {
                ...s,
                polygon: [
                  [minXf, maxYf],
                  [maxXf, maxYf],
                  [maxXf, minYf],
                  [minXf, minYf],
                ],
              }
            : s
        )
      );
    } else if (d.kind === "vertex") {
      const p: Pt = [r2(feet[0]), r2(feet[1])];
      updatePolygonByKey(d.key, (poly) => poly.map((pt, i) => (i === d.idx ? p : pt)));
    } else if (d.kind === "label") {
      setDZones((prev) =>
        prev.map((z) => (z.key === d.key ? { ...z, labelX: r2(feet[0]), labelY: r2(feet[1]) } : z))
      );
    }
  }

  function onSvgPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (d?.kind === "structDraw") {
      setDrawRect(null);
      addStructure(d.start, clientToFeet(e.clientX, e.clientY));
    }
    drag.current = null;
  }

  // Named component-scope drag starters — keeps all ref writes out of
  // closures created inside render-time .map() callbacks (the React
  // Compiler flags those as render-time ref access).
  function startMove(e: React.PointerEvent, key: string, isBed: boolean) {
    if (tool !== "select") return;
    e.stopPropagation();
    moved.current = 0;
    setSelectedKey(key);
    drag.current = { kind: "move", key, isBed, lastFeet: clientToFeet(e.clientX, e.clientY) };
  }

  function startBedEndDrag(e: React.PointerEvent, key: string, end: 1 | 2) {
    e.stopPropagation();
    moved.current = 0;
    drag.current = { kind: "bedEnd", key, end };
  }

  function startCornerDrag(e: React.PointerEvent, key: string, anchor: Pt) {
    e.stopPropagation();
    moved.current = 0;
    drag.current = { kind: "corner", key, anchor };
  }

  function startVertexDrag(e: React.PointerEvent, key: string, idx: number) {
    e.stopPropagation();
    moved.current = 0;
    drag.current = { kind: "vertex", key, idx };
  }

  // Pressing an edge-midpoint handle inserts a vertex there and immediately
  // starts dragging it — one gesture to bend an edge outward.
  function insertVertexAndDrag(e: React.PointerEvent, key: string, afterIdx: number, mid: Pt) {
    e.stopPropagation();
    moved.current = 0;
    updatePolygonByKey(key, (poly) => [...poly.slice(0, afterIdx + 1), mid, ...poly.slice(afterIdx + 1)]);
    drag.current = { kind: "vertex", key, idx: afterIdx + 1 };
  }

  function startLabelDrag(e: React.PointerEvent, key: string) {
    if (tool !== "zones" || drawingZone) return;
    e.stopPropagation();
    moved.current = 0;
    setSelectedKey(key);
    drag.current = { kind: "label", key };
  }

  // Zones-tool selection for zone/boundary/strip polygons.
  function selectShape(e: React.PointerEvent, key: string) {
    if (tool !== "zones" || drawingZone) return;
    e.stopPropagation();
    setSelectedKey(key);
  }

  function onSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (moved.current > 8) return; // drag, not a click
    if (tool === "bed") {
      const feet = clientToFeet(e.clientX, e.clientY);
      if (!pendingStart) setPendingStart(feet);
      else addBed(pendingStart, feet);
    } else if (tool === "zones" && drawingZone) {
      const feet = clientToFeet(e.clientX, e.clientY);
      // Clicking back near the first vertex closes the polygon.
      if (
        drawingZone.length >= 3 &&
        Math.hypot(feet[0] - drawingZone[0][0], feet[1] - drawingZone[0][1]) < 6
      ) {
        finishZoneDrawing();
        return;
      }
      setDrawingZone([...drawingZone, [r2(feet[0]), r2(feet[1])]]);
    } else if ((tool === "select" || tool === "zones") && e.target === e.currentTarget) {
      setSelectedKey(null);
    }
  }

  // Wheel zoom via native listener isn't needed here (edit mode is desktop
  // only and the page doesn't scroll under the +/- buttons), keep it simple.

  // --- Validation overlays ---------------------------------------------------
  // Overlaps and outside-zone are warnings (real sites cheat margins);
  // self-intersecting polygons are blockers — they'd break point-in-polygon
  // everywhere, so Save is disabled and the server rejects them too.
  const warnings = useMemo(() => {
    const quads = dBeds.map((b) => ({ key: b.key, code: b.code, quad: bedQuad(b) }));
    const flagged = new Set<string>();
    const messages: string[] = [];
    const blockers: string[] = [];
    for (let i = 0; i < quads.length; i++) {
      for (let j = i + 1; j < quads.length; j++) {
        if (convexPolygonsOverlap(quads[i].quad, quads[j].quad)) {
          flagged.add(quads[i].key);
          flagged.add(quads[j].key);
          messages.push(`${quads[i].code} overlaps ${quads[j].code}`);
        }
      }
      for (const s of dStructs) {
        if (convexPolygonsOverlap(quads[i].quad, s.polygon)) {
          flagged.add(quads[i].key);
          flagged.add(s.key);
          messages.push(`${quads[i].code} overlaps ${s.label}`);
        }
      }
    }
    const zoneById = new Map(dZones.filter((z) => z.id).map((z) => [z.id!, z]));
    for (const b of dBeds) {
      const z = zoneById.get(b.zoneId);
      if (z && !pointInPolygon([(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2], z.polygon)) {
        messages.push(`${b.code} lies outside ${z.name}`);
      }
    }
    for (const shape of [...dZones, ...dShapes]) {
      if (isSelfIntersecting(shape.polygon)) {
        flagged.add(shape.key);
        const name = "name" in shape ? shape.name : shape.label;
        blockers.push(`${name}: outline crosses itself — untangle it before saving`);
      }
    }
    return { flagged, messages, blockers };
  }, [dBeds, dStructs, dZones, dShapes]);

  // --- Dirty diff & save -----------------------------------------------------
  const origBeds = useMemo(() => new Map(layout.beds.map((b) => [b.id, b])), [layout.beds]);
  const origStructs = useMemo(
    () => new Map(layout.features.filter((f) => f.kind === "structure").map((f) => [f.id, f])),
    [layout.features]
  );

  const changedBeds = dBeds.filter((b) => {
    if (!b.id) return true;
    const o = origBeds.get(b.id)!;
    return (
      o.code !== b.code ||
      o.zoneId !== b.zoneId ||
      o.x1 !== b.x1 ||
      o.y1 !== b.y1 ||
      o.x2 !== b.x2 ||
      o.y2 !== b.y2 ||
      o.widthFt !== b.widthFt
    );
  });
  const changedStructs = dStructs.filter((s) => {
    if (!s.id) return true;
    const o = origStructs.get(s.id)!;
    return (
      (o.label ?? "") !== s.label ||
      o.structureType !== s.structureType ||
      o.warehouseId !== s.warehouseId ||
      JSON.stringify(o.polygonPts) !== JSON.stringify(s.polygon)
    );
  });
  const origZones = useMemo(() => new Map(layout.zones.map((z) => [z.id, z])), [layout.zones]);
  const changedZones = dZones.filter((z) => {
    if (!z.id) return true;
    const o = origZones.get(z.id)!;
    return (
      o.code !== z.code ||
      o.name !== z.name ||
      JSON.stringify(o.polygonPts) !== JSON.stringify(z.polygon) ||
      o.labelPt?.[0] !== z.labelX ||
      o.labelPt?.[1] !== z.labelY
    );
  });
  const origShapes = useMemo(
    () => new Map(layout.features.filter((f) => f.kind !== "structure").map((f) => [f.id, f])),
    [layout.features]
  );
  const changedShapes = dShapes.filter(
    (s) => JSON.stringify(origShapes.get(s.id)?.polygonPts) !== JSON.stringify(s.polygon)
  );
  const changeCount =
    changedBeds.length +
    changedStructs.length +
    changedZones.length +
    changedShapes.length +
    retireBedIds.length +
    retireStructureIds.length;

  function save() {
    startSaving(async () => {
      const res = await saveLayoutEdits({
        expectedVersion: layout.version,
        beds: changedBeds.map((b) => ({
          id: b.id,
          code: b.code,
          zoneId: b.zoneId,
          x1: b.x1,
          y1: b.y1,
          x2: b.x2,
          y2: b.y2,
          widthFt: b.widthFt,
        })),
        retireBedIds,
        structures: changedStructs.map((s) => ({
          id: s.id,
          label: s.label,
          structureType: s.structureType,
          warehouseId: s.warehouseId,
          polygon: s.polygon,
        })),
        retireStructureIds,
        zones: changedZones.map((z) => ({
          id: z.id,
          code: z.code,
          name: z.name,
          polygon: z.polygon,
          labelX: z.labelX,
          labelY: z.labelY,
        })),
        featureShapes: changedShapes.map((s) => ({ id: s.id, polygon: s.polygon })),
      });
      if (res.ok) {
        toast.success("Layout saved");
        onExit();
      } else {
        toast.error(res.error);
      }
    });
  }

  function cancel() {
    if (changeCount > 0 && !window.confirm(`Discard ${changeCount} unsaved change(s)?`)) return;
    onExit();
  }

  // --- Selected object for the panel ----------------------------------------
  const selBed = dBeds.find((b) => b.key === selectedKey) ?? null;
  const selStruct = dStructs.find((s) => s.key === selectedKey) ?? null;
  const selZone = dZones.find((z) => z.key === selectedKey) ?? null;
  const selShape = dShapes.find((s) => s.key === selectedKey) ?? null;
  // The polygon whose vertex handles are shown in the zones tool.
  const selPoly = tool === "zones" && !drawingZone ? (selZone ?? selShape) : null;

  function setBedLength(key: string, len: number) {
    const b = dBeds.find((x) => x.key === key);
    if (!b || !Number.isFinite(len) || len < 2) return;
    const L = segmentLength(b) || 1;
    const ux = (b.x2 - b.x1) / L;
    const uy = (b.y2 - b.y1) / L;
    updateBed(key, { x2: r2(b.x1 + ux * len), y2: r2(b.y1 + uy * len) });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Site Layout — editing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tool === "bed"
              ? pendingStart
                ? "Click the other end of the new bed."
                : "Click where the new bed starts."
              : tool === "structure"
                ? "Drag a rectangle where the structure goes."
                : tool === "zones"
                  ? drawingZone
                    ? "Click to add corners; click the first corner again to close the zone."
                    : "Click a zone or the plot outline to reshape it — drag vertices, press a midpoint to add one, double-click a vertex to remove it."
                  : "Click an object to edit it; drag to move; drag its handles to resize."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {warnings.blockers.length > 0 ? (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> fix outline(s) to save
            </span>
          ) : (
            warnings.messages.length > 0 && (
              <span className="flex items-center gap-1 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" /> {warnings.messages.length} warning(s)
              </span>
            )
          )}
          <Button variant="outline" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || changeCount === 0 || warnings.blockers.length > 0}
          >
            {saving ? "Saving…" : `Save changes${changeCount > 0 ? ` (${changeCount})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant={tool === "select" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTool("select");
            setPendingStart(null);
            setDrawingZone(null);
          }}
        >
          <MousePointer2 className="mr-1.5 h-3.5 w-3.5" /> Select
        </Button>
        <Button
          variant={tool === "bed" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTool("bed");
            setSelectedKey(null);
            setDrawingZone(null);
          }}
        >
          <Minus className="mr-1.5 h-3.5 w-3.5" /> Add bed
        </Button>
        <Button
          variant={tool === "structure" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTool("structure");
            setSelectedKey(null);
            setPendingStart(null);
          }}
        >
          <Square className="mr-1.5 h-3.5 w-3.5" /> Add structure
        </Button>
        <Button
          variant={tool === "zones" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTool("zones");
            setSelectedKey(null);
            setPendingStart(null);
            setDrawingZone(null);
          }}
        >
          <Hexagon className="mr-1.5 h-3.5 w-3.5" /> Zones &amp; plot
        </Button>
        {tool === "bed" && (
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap parallel to nearest bed
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="relative">
              <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
                <Button variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => zoomCentered(1.5)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => zoomCentered(1 / 1.5)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                {view.k > 1 && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Reset zoom"
                    onClick={() => setView({ k: 1, tx: 0, ty: 0 })}
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="mx-auto h-auto w-full select-none"
                style={{
                  touchAction: "none",
                  cursor: tool === "bed" ? "crosshair" : tool === "structure" ? "crosshair" : "default",
                }}
                role="img"
                aria-label="Site layout editor"
                onPointerDown={onSvgPointerDown}
                onPointerMove={onSvgPointerMove}
                onPointerUp={onSvgPointerUp}
                onPointerLeave={onSvgPointerUp}
                onClick={onSvgClick}
              >
                <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.k})`}>
                  {dShapes
                    .filter((s) => s.kind === "boundary")
                    .map((s) => (
                      <polygon
                        key={s.key}
                        points={poly(s.polygon)}
                        className={`fill-muted/30 ${
                          warnings.flagged.has(s.key)
                            ? "stroke-destructive"
                            : selectedKey === s.key
                              ? "stroke-primary"
                              : "stroke-foreground/60"
                        } ${tool === "zones" && !drawingZone ? "cursor-pointer" : ""}`}
                        strokeWidth={selectedKey === s.key ? 2.5 : 1.5}
                        onPointerDown={(e) => selectShape(e, s.key)}
                      />
                    ))}
                  {dShapes
                    .filter((s) => s.kind === "strip")
                    .map((s) => (
                      <polygon
                        key={s.key}
                        points={poly(s.polygon)}
                        className={`fill-muted/50 ${
                          warnings.flagged.has(s.key)
                            ? "stroke-destructive"
                            : selectedKey === s.key
                              ? "stroke-primary"
                              : "stroke-foreground/20"
                        } ${tool === "zones" && !drawingZone ? "cursor-pointer" : ""}`}
                        strokeWidth={selectedKey === s.key ? 2 : 0.75}
                        onPointerDown={(e) => selectShape(e, s.key)}
                      />
                    ))}
                  {dZones.map((z, i) => (
                    <polygon
                      key={z.key}
                      points={poly(z.polygon)}
                      className={`${ZONE_STYLES[i % ZONE_STYLES.length].poly} ${
                        warnings.flagged.has(z.key) ? "stroke-destructive" : ""
                      } ${tool === "zones" && !drawingZone ? "cursor-pointer" : ""}`}
                      strokeWidth={selectedKey === z.key ? 2.5 : 1}
                      strokeDasharray={z.id ? undefined : "5 3"}
                      onPointerDown={(e) => selectShape(e, z.key)}
                    />
                  ))}
                  {dZones.map((z, i) => (
                    <text
                      key={z.key}
                      x={px([z.labelX, z.labelY])[0]}
                      y={px([z.labelX, z.labelY])[1]}
                      className={`${ZONE_STYLES[i % ZONE_STYLES.length].label} text-[13px] font-semibold ${
                        tool === "zones" && !drawingZone ? "cursor-move" : ""
                      }`}
                      onPointerDown={(e) => startLabelDrag(e, z.key)}
                    >
                      {z.name}
                    </text>
                  ))}

                  {/* Structures */}
                  {dStructs.map((s) => {
                    const isSelected = s.key === selectedKey;
                    const flagged = warnings.flagged.has(s.key);
                    const bxs = s.polygon.map((p) => p[0]);
                    const bys = s.polygon.map((p) => p[1]);
                    const labelX = Math.min(...bxs) + 2;
                    const midY = (Math.min(...bys) + Math.max(...bys)) / 2;
                    const lines = splitLabel(s.label);
                    return (
                      <g
                        key={s.key}
                        className="cursor-move"
                        style={{ pointerEvents: tool === "zones" ? "none" : undefined }}
                        onPointerDown={(e) => startMove(e, s.key, false)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <polygon
                          points={poly(s.polygon)}
                          className={
                            flagged
                              ? "fill-destructive/15 stroke-destructive"
                              : "fill-info/15 stroke-info"
                          }
                          strokeWidth={isSelected ? 2 : 1.25}
                          strokeDasharray={s.id ? undefined : "4 2"}
                        />
                        {lines.map((line, li) => (
                          <text
                            key={li}
                            x={px([labelX, midY + 2 - li * 6])[0]}
                            y={px([labelX, midY + 2 - li * 6])[1]}
                            className="fill-info text-[9px] font-semibold"
                          >
                            {line}
                          </text>
                        ))}
                        {isSelected &&
                          s.polygon.map((corner, ci) => (
                            <circle
                              key={ci}
                              cx={px(corner)[0]}
                              cy={px(corner)[1]}
                              r={4}
                              className="cursor-nwse-resize fill-primary stroke-background"
                              strokeWidth="1.5"
                              onPointerDown={(e) => startCornerDrag(e, s.key, s.polygon[(ci + 2) % 4])}
                            />
                          ))}
                      </g>
                    );
                  })}

                  {/* Beds */}
                  {dBeds.map((b) => {
                    const quad = bedQuad(b);
                    const isSelected = b.key === selectedKey;
                    const flagged = warnings.flagged.has(b.key);
                    const c = px([(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]);
                    return (
                      <g
                        key={b.key}
                        className="cursor-move"
                        style={{ pointerEvents: tool === "zones" ? "none" : undefined }}
                        onPointerDown={(e) => startMove(e, b.key, true)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <polygon
                          points={poly(quad)}
                          className={
                            flagged
                              ? "fill-destructive/20 stroke-destructive"
                              : b.occupied
                                ? "fill-success/40 stroke-success"
                                : "fill-background dark:fill-muted stroke-foreground/40"
                          }
                          strokeWidth={isSelected ? 2.5 : 1}
                          strokeDasharray={b.id ? undefined : "4 2"}
                        />
                        {isSelected && (
                          <polygon points={poly(quad)} fill="none" className="stroke-primary" strokeWidth="2" />
                        )}
                        <text
                          x={c[0]}
                          y={c[1] + 2.5}
                          textAnchor="middle"
                          className="pointer-events-none fill-muted-foreground text-[6.5px] font-medium"
                        >
                          {b.code.split("-")[1]}
                        </text>
                        {isSelected && (
                          <>
                            <circle
                              cx={px([b.x1, b.y1])[0]}
                              cy={px([b.x1, b.y1])[1]}
                              r={4}
                              className="cursor-crosshair fill-primary stroke-background"
                              strokeWidth="1.5"
                              onPointerDown={(e) => startBedEndDrag(e, b.key, 1)}
                            />
                            <circle
                              cx={px([b.x2, b.y2])[0]}
                              cy={px([b.x2, b.y2])[1]}
                              r={4}
                              className="cursor-crosshair fill-primary stroke-background"
                              strokeWidth="1.5"
                              onPointerDown={(e) => startBedEndDrag(e, b.key, 2)}
                            />
                          </>
                        )}
                      </g>
                    );
                  })}

                  {/* Add-bed preview */}
                  {tool === "bed" && pendingStart && (
                    <>
                      <circle cx={px(pendingStart)[0]} cy={px(pendingStart)[1]} r={3} className="fill-primary" />
                      {cursorFeet && (
                        <line
                          x1={px(pendingStart)[0]}
                          y1={px(pendingStart)[1]}
                          x2={px(snapEnd(pendingStart, cursorFeet))[0]}
                          y2={px(snapEnd(pendingStart, cursorFeet))[1]}
                          className="stroke-primary"
                          strokeWidth="2"
                          strokeDasharray="4 3"
                        />
                      )}
                    </>
                  )}

                  {/* Add-structure preview */}
                  {drawRect && (
                    <polygon
                      points={poly([
                        [Math.min(drawRect.a[0], drawRect.b[0]), Math.max(drawRect.a[1], drawRect.b[1])],
                        [Math.max(drawRect.a[0], drawRect.b[0]), Math.max(drawRect.a[1], drawRect.b[1])],
                        [Math.max(drawRect.a[0], drawRect.b[0]), Math.min(drawRect.a[1], drawRect.b[1])],
                        [Math.min(drawRect.a[0], drawRect.b[0]), Math.min(drawRect.a[1], drawRect.b[1])],
                      ])}
                      className="fill-primary/10 stroke-primary"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Vertex handles for the selected zone/boundary/strip */}
                  {selPoly && (
                    <g>
                      {selPoly.polygon.map((pt, i) => {
                        const next = selPoly.polygon[(i + 1) % selPoly.polygon.length];
                        const mid: Pt = [r2((pt[0] + next[0]) / 2), r2((pt[1] + next[1]) / 2)];
                        return (
                          <circle
                            key={`m${i}`}
                            cx={px(mid)[0]}
                            cy={px(mid)[1]}
                            r={3}
                            className="cursor-copy fill-background stroke-primary"
                            strokeWidth="1.25"
                            onPointerDown={(e) => insertVertexAndDrag(e, selPoly.key, i, mid)}
                          >
                            <title>Add a vertex here</title>
                          </circle>
                        );
                      })}
                      {selPoly.polygon.map((pt, i) => (
                        <circle
                          key={`v${i}`}
                          cx={px(pt)[0]}
                          cy={px(pt)[1]}
                          r={4.5}
                          className="cursor-move fill-primary stroke-background"
                          strokeWidth="1.5"
                          onPointerDown={(e) => startVertexDrag(e, selPoly.key, i)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            removeVertexAt(selPoly.key, i);
                          }}
                        >
                          <title>Drag to move · double-click to remove</title>
                        </circle>
                      ))}
                    </g>
                  )}

                  {/* Draw-new-zone preview */}
                  {drawingZone && (
                    <g className="pointer-events-none">
                      {drawingZone.length >= 2 && (
                        <polyline
                          points={drawingZone.map((p) => px(p).join(",")).join(" ")}
                          fill="none"
                          className="stroke-primary"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      )}
                      {drawingZone.length >= 1 && cursorFeet && (
                        <line
                          x1={px(drawingZone[drawingZone.length - 1])[0]}
                          y1={px(drawingZone[drawingZone.length - 1])[1]}
                          x2={px(cursorFeet)[0]}
                          y2={px(cursorFeet)[1]}
                          className="stroke-primary/50"
                          strokeWidth="1.5"
                          strokeDasharray="2 3"
                        />
                      )}
                      {drawingZone.map((p, i) => (
                        <circle
                          key={i}
                          cx={px(p)[0]}
                          cy={px(p)[1]}
                          r={i === 0 ? 5 : 3}
                          className={i === 0 ? "fill-background stroke-primary" : "fill-primary"}
                          strokeWidth="1.5"
                        />
                      ))}
                    </g>
                  )}
                </g>
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Properties panel */}
        <div className="space-y-3">
          {selBed ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{selBed.id ? "Bed" : "New bed"}</h2>
                  {selBed.occupied && <span className="text-xs text-success">occupied</span>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bed-code">Code</Label>
                  <Input
                    id="bed-code"
                    value={selBed.code}
                    onChange={(e) => updateBed(selBed.key, { code: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bed-zone">Zone</Label>
                  <NativeSelect
                    id="bed-zone"
                    value={selBed.zoneId}
                    onChange={(e) => updateBed(selBed.key, { zoneId: Number(e.target.value) })}
                  >
                    {persistedZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bed-len">Length (ft)</Label>
                    <Input
                      id="bed-len"
                      type="number"
                      step="0.5"
                      min="2"
                      value={r2(segmentLength(selBed))}
                      onChange={(e) => setBedLength(selBed.key, Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bed-w">Width (ft)</Label>
                    <Input
                      id="bed-w"
                      type="number"
                      step="0.5"
                      min="1"
                      value={selBed.widthFt}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        if (Number.isFinite(w) && w >= 1) updateBed(selBed.key, { widthFt: w });
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Length edits keep the first end fixed. Drag the round handles on the map to
                  reposition either end freely.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={removeSelected}
                  disabled={selBed.occupied}
                  title={selBed.occupied ? "Occupied by an in-progress order — complete it first" : undefined}
                >
                  {selBed.id ? "Retire bed" : "Remove"}
                </Button>
                {selBed.occupied && (
                  <p className="text-xs text-muted-foreground">
                    Occupied beds can&apos;t be retired until their order completes.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : selStruct ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">{selStruct.id ? "Structure" : "New structure"}</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="st-label">Name</Label>
                  <Input
                    id="st-label"
                    value={selStruct.label}
                    onChange={(e) => updateStruct(selStruct.key, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="st-type">Type</Label>
                  <NativeSelect
                    id="st-type"
                    value={selStruct.structureType}
                    onChange={(e) => updateStruct(selStruct.key, { structureType: e.target.value as StructureType })}
                  >
                    {STRUCTURE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="st-wh">Linked warehouse (optional)</Label>
                  <NativeSelect
                    id="st-wh"
                    value={selStruct.warehouseId ?? ""}
                    onChange={(e) =>
                      updateStruct(selStruct.key, {
                        warehouseId: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">— none —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    Link storage buildings to their inventory warehouse; leave tanks and other
                    fixtures unlinked.
                  </p>
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={removeSelected}>
                  {selStruct.id ? "Retire structure" : "Remove"}
                </Button>
              </CardContent>
            </Card>
          ) : selZone ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">{selZone.id ? "Zone" : "New zone"}</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="zn-code">Code</Label>
                  <Input
                    id="zn-code"
                    value={selZone.code}
                    onChange={(e) => updateZone(selZone.key, { code: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zn-name">Name</Label>
                  <Input
                    id="zn-name"
                    value={selZone.name}
                    onChange={(e) => updateZone(selZone.key, { name: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {selZone.polygon.length} corners ·{" "}
                  {dBeds.filter((b) => b.zoneId === selZone.id).length} beds. Drag the round
                  handles to reshape; press a midpoint dot to add a corner; double-click a corner
                  to remove it. The zone name on the map can be dragged too.
                </p>
                {!selZone.id && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Beds can be assigned to this zone after saving.
                    </p>
                    <Button variant="destructive" size="sm" className="w-full" onClick={removeSelected}>
                      Remove
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : selShape ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">{selShape.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {selShape.polygon.length} corners. Drag the round handles to reshape; press a
                  midpoint dot to add a corner; double-click a corner to remove it.
                  {selShape.kind === "boundary" &&
                    " This is the surveyed plot outline — the map view re-fits itself to it after saving."}
                </p>
              </CardContent>
            </Card>
          ) : tool !== "zones" ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Select an object on the map to edit its properties, or use the Add tools above.
                Nothing is saved until you press <span className="font-medium">Save changes</span>.
              </CardContent>
            </Card>
          ) : null}

          {/* Zones-tool navigator — always visible so selection can jump
              between zones and the plot outline without deselecting first. */}
          {tool === "zones" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">Zones &amp; plot</h2>
                {drawingZone ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {drawingZone.length} corner(s) placed. Click the map to add more; click the
                      first corner (large dot) to close.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={drawingZone.length < 3}
                        onClick={finishZoneDrawing}
                      >
                        Finish zone
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setDrawingZone(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {dZones.map((z) => (
                        <Button
                          key={z.key}
                          variant={selectedKey === z.key ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedKey(z.key)}
                        >
                          {z.name}
                        </Button>
                      ))}
                      {dShapes.map((s) => (
                        <Button
                          key={s.key}
                          variant={selectedKey === s.key ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedKey(s.key)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedKey(null);
                        setDrawingZone([]);
                      }}
                    >
                      Draw new zone
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {(warnings.messages.length > 0 || warnings.blockers.length > 0) && (
            <Card>
              <CardContent className="pt-6">
                {warnings.blockers.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" /> Blocking
                    </div>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-destructive">
                      {warnings.blockers.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {warnings.messages.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
                      <AlertTriangle className="h-4 w-4" /> Warnings
                    </div>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {warnings.messages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Warnings don&apos;t block saving — check the physical site if unsure.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
