"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Pencil, RadioTower, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BedLayout } from "@/modules/layout/queries";
import {
  MAINTENANCE_TASK_TYPES,
  MAINTENANCE_TASK_LABELS,
  type Pt,
} from "@/modules/layout/types";
import type { Item, Warehouse } from "@/modules/masters/types";
import { fmtDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { MaintenanceDialog } from "./maintenance-dialog";
import { LayoutEditor } from "./layout-editor";

const POLL_INTERVAL_MS = 20_000;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

// Site-plan feet → SVG px. y is flipped (plan y grows north, SVG y grows down).
const PAD = 14;
const SCALE = 2.4;

type View = { k: number; tx: number; ty: number };

// Zones cycle through this palette in code order — Z1 green, Z2 amber,
// matching the surveyed plan's own zone colors; a future Z3 gets blue.
// Exported for the layout editor, which renders the same base map.
export const ZONE_STYLES = [
  { poly: "fill-success/10 stroke-success/50", label: "fill-success" },
  { poly: "fill-warning/10 stroke-warning/50", label: "fill-warning" },
  { poly: "fill-info/10 stroke-info/50", label: "fill-info" },
];

// Structure labels render inside the shape; break long ones at the space
// nearest the middle so e.g. "Machine Shed & Godown" wraps to two lines.
export function splitLabel(label: string): string[] {
  if (label.length <= 13) return [label];
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best === -1 || Math.abs(i - label.length / 2) < Math.abs(best - label.length / 2))) {
      best = i;
    }
  }
  return best === -1 ? [label] : [label.slice(0, best), label.slice(best + 1)];
}

export function LayoutView({
  layout,
  rawMaterialItems,
  defaultBioEnzymeItemId,
  canEdit,
  warehouses,
}: {
  layout: BedLayout;
  rawMaterialItems: Item[];
  defaultBioEnzymeItemId: number | null;
  canEdit: boolean;
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Track the selected bed by id, not the object itself — the object goes
  // stale the moment a poll brings fresh data, since it's a snapshot from
  // whenever it was clicked.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = layout.beds.find((b) => b.id === selectedId) ?? null;
  const detailRef = useRef<HTMLDivElement>(null);

  function selectBed(id: number) {
    setSelectedId(id);
    // On narrow screens the detail panel sits below the map — bring it into
    // view so a tap visibly does something.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
    }
  }

  // Auto-refresh: re-run the server component on an interval so the map
  // reflects production activity without a manual reload. Skips ticks while
  // the tab is hidden (a field phone with the screen off shouldn't poll).
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (editing) return; // draft edits shouldn't race live refreshes
      router.refresh();
      setLastUpdated(Date.now());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [router, editing]);
  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const secondsAgo = Math.max(0, Math.round((nowTick - lastUpdated) / 1000));

  // --- Projection: site-plan feet → SVG px ----------------------------------
  // Derived from the plot-boundary feature (all geometry is data since the
  // Phase A refactor). Keyed on the polygon JSON string so px/poly keep a
  // stable identity across the 20s polls, which hand us fresh props.
  const boundaryJson = layout.features.find((f) => f.kind === "boundary")?.polygon ?? "[]";
  const { W, H, px, poly } = useMemo(() => {
    const pts = JSON.parse(boundaryJson) as Pt[];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = pts.length ? Math.min(...xs) : 0;
    const maxY = pts.length ? Math.max(...ys) : 0;
    const W = pts.length ? (Math.max(...xs) - minX) * SCALE + PAD * 2 : 100;
    const H = pts.length ? (maxY - Math.min(...ys)) * SCALE + PAD * 2 : 100;
    const px = (p: Pt): [number, number] => [(p[0] - minX) * SCALE + PAD, (maxY - p[1]) * SCALE + PAD];
    const poly = (points: Pt[]) => points.map((p) => px(p).join(",")).join(" ");
    return { W, H, px, poly };
  }, [boundaryJson]);

  // Keep the (translated, scaled) content covering the viewport; snap fully
  // back when zoomed all the way out.
  function clampView(v: View): View {
    if (v.k <= MIN_ZOOM) return { k: MIN_ZOOM, tx: 0, ty: 0 };
    return {
      k: Math.min(v.k, MAX_ZOOM),
      tx: Math.min(0, Math.max(W - W * v.k, v.tx)),
      ty: Math.min(0, Math.max(H - H * v.k, v.ty)),
    };
  }

  // --- Zoom & pan -----------------------------------------------------------
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  // Live pointers on the SVG (1 = pan, 2 = pinch) plus how far the current
  // gesture has moved — used to swallow the click that ends a drag.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, lastDist: 0 });

  function clientToView(clientX: number, clientY: number): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    return [((clientX - rect.left) * W) / rect.width, ((clientY - rect.top) * H) / rect.height];
  }

  function zoomAt(vx: number, vy: number, factor: number) {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      const f = k / v.k;
      return clampView({ k, tx: vx - (vx - v.tx) * f, ty: vy - (vy - v.ty) * f });
    });
  }

  function zoomCentered(factor: number) {
    zoomAt(W / 2, H / 2, factor);
  }

  // Wheel zoom needs a native non-passive listener — React's synthetic wheel
  // handler can't preventDefault (the root listener is passive).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) * W) / rect.width;
      const vy = ((e.clientY - rect.top) * H) / rect.height;
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const f = k / v.k;
        return clampView({ k, tx: vx - (vx - v.tx) * f, ty: vy - (vy - v.ty) * f });
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // No pointer capture here — capturing retargets the eventual `click` to
    // the svg, which would silently break bed selection on the <g> elements.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svgRef.current!.getBoundingClientRect();
    const toView = W / rect.width;

    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (view.k > 1) {
        setView((v) => clampView({ ...v, tx: v.tx + dx * toView, ty: v.ty + dy * toView }));
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const last = gesture.current.lastDist || dist;
      gesture.current.lastDist = dist;
      gesture.current.moved += Math.abs(dist - last);
      const [vx, vy] = clientToView((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(vx, vy, dist / last);
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current.lastDist = 0;
  }

  // A drag that moved more than a tap's worth shouldn't select a bed.
  function wasDrag() {
    return gesture.current.moved > 8;
  }

  // --- Hover tooltip (mouse only — touch uses the detail panel) -------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ bedId: number; x: number; y: number } | null>(null);

  function showTooltip(e: React.PointerEvent, bedId: number) {
    if (e.pointerType !== "mouse") return;
    const rect = wrapRef.current!.getBoundingClientRect();
    setTooltip({ bedId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  const tooltipBed = tooltip ? layout.beds.find((b) => b.id === tooltip.bedId) : null;

  const occupiedCount = layout.beds.filter((b) => b.occupant).length;

  // Each bed is a general (x1,y1)-(x2,y2) centerline segment + width — not
  // axis-aligned, so render as a rotated quadrilateral (4 corners offset
  // perpendicular to the segment by half the bed width).
  const bedPolys = useMemo(
    () =>
      layout.beds.map((b) => {
        const dx = b.x2 - b.x1;
        const dy = b.y2 - b.y1;
        const len = Math.hypot(dx, dy) || 1;
        const px_ = (-dy / len) * (b.widthFt / 2);
        const py_ = (dx / len) * (b.widthFt / 2);
        const corners: Pt[] = [
          [b.x1 + px_, b.y1 + py_],
          [b.x2 + px_, b.y2 + py_],
          [b.x2 - px_, b.y2 - py_],
          [b.x1 - px_, b.y1 - py_],
        ];
        const centroid = px([(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]);
        return { bed: b, corners: corners.map(px), centroid };
      }),
    [layout.beds, px]
  );

  if (editing) {
    return <LayoutEditor layout={layout} warehouses={warehouses} onExit={() => setEditing(false)} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Site Layout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tantipara plant — {layout.beds.length} vermicompost beds ({occupiedCount} occupied).
            Click a bed for details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-border bg-muted" /> Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-success" /> Composting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-warning" /> Needs attention
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-info bg-info/15" /> Shed
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground" title="Auto-refreshes every 20s">
            <RadioTower className="h-3.5 w-3.5 animate-pulse text-success" />
            updated {secondsAgo}s ago
          </span>
          {canEdit && (
            // Editing needs mouse precision — desktop only; viewing stays mobile-first.
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit layout
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div ref={wrapRef} className="relative">
              {/* Zoom controls — the primary zoom path on touch devices */}
              <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Zoom in"
                  onClick={() => zoomCentered(1.5)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={() => zoomCentered(1 / 1.5)}
                >
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
                  // Zoomed out: let vertical swipes scroll the page. Zoomed in:
                  // the map owns the gesture (pan/pinch).
                  touchAction: view.k > 1 ? "none" : "pan-y",
                  cursor: view.k > 1 ? "grab" : "default",
                }}
                role="img"
                aria-label="Site layout with vermicompost beds"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.k})`}>
                  {/* Plot boundary */}
                  {layout.features
                    .filter((f) => f.kind === "boundary")
                    .map((f) => (
                      <polygon
                        key={f.id}
                        points={poly(f.polygonPts)}
                        className="fill-muted/30 stroke-foreground/60"
                        strokeWidth="1.5"
                      />
                    ))}
                  {/* Access strip */}
                  {layout.features
                    .filter((f) => f.kind === "strip")
                    .map((f) => (
                      <polygon
                        key={f.id}
                        points={poly(f.polygonPts)}
                        className="fill-muted/50 stroke-foreground/20"
                        strokeWidth="0.75"
                      />
                    ))}
                  {/* Zones */}
                  {layout.zones.map(
                    (z, i) =>
                      z.polygonPts && (
                        <polygon
                          key={z.id}
                          points={poly(z.polygonPts)}
                          className={ZONE_STYLES[i % ZONE_STYLES.length].poly}
                          strokeWidth="1"
                        />
                      )
                  )}

                  {/* Structures (sheds, godowns, tanks…) */}
                  {layout.features
                    .filter((f) => f.kind === "structure")
                    .map((f) => {
                      const bxs = f.polygonPts.map((p) => p[0]);
                      const bys = f.polygonPts.map((p) => p[1]);
                      const labelX = Math.min(...bxs) + 2;
                      const midY = (Math.min(...bys) + Math.max(...bys)) / 2;
                      const lines = f.label ? splitLabel(f.label) : [];
                      return (
                        <g key={f.id}>
                          <polygon
                            points={poly(f.polygonPts)}
                            className="fill-info/15 stroke-info"
                            strokeWidth="1.25"
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
                        </g>
                      );
                    })}

                  {/* Zone labels */}
                  {layout.zones.map(
                    (z, i) =>
                      z.labelPt && (
                        <text
                          key={z.id}
                          x={px(z.labelPt)[0]}
                          y={px(z.labelPt)[1]}
                          className={`${ZONE_STYLES[i % ZONE_STYLES.length].label} text-[13px] font-semibold`}
                        >
                          {z.name} · {layout.beds.filter((b) => b.zoneId === z.id).length} beds
                        </text>
                      )
                  )}

                  {/* Beds — each a quadrilateral at its exact surveyed angle */}
                  {bedPolys.map(({ bed, corners, centroid }) => {
                    const occupied = !!bed.occupant;
                    const isSelected = selected?.id === bed.id;
                    const pointsStr = corners.map((c) => c.join(",")).join(" ");
                    const [cx, cy] = centroid;
                    const needsAttention =
                      occupied &&
                      (bed.occupant!.stale || bed.occupant!.hasDeviation || bed.occupant!.maintenanceOverdueCount > 0);
                    const attentionReason = occupied
                      ? [
                          bed.occupant!.stale && "reading overdue",
                          bed.occupant!.hasDeviation && "deviation flagged",
                          bed.occupant!.maintenanceOverdueCount > 0 &&
                            `${bed.occupant!.maintenanceOverdueCount} maintenance task(s) overdue`,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "";
                    return (
                      <g
                        key={bed.id}
                        onClick={() => {
                          if (!wasDrag()) selectBed(bed.id);
                        }}
                        onPointerEnter={(e) => showTooltip(e, bed.id)}
                        onPointerMove={(e) => {
                          if (tooltip?.bedId === bed.id) showTooltip(e, bed.id);
                        }}
                        onPointerLeave={() => setTooltip(null)}
                        className="cursor-pointer"
                        role="button"
                        aria-label={`Bed ${bed.code}${
                          occupied
                            ? `, occupied by ${bed.occupant!.orderNo}, day ${bed.occupant!.daysInBed}${attentionReason ? `, ${attentionReason}` : ""}`
                            : ", empty"
                        }`}
                      >
                        <polygon
                          points={pointsStr}
                          className={
                            occupied
                              ? needsAttention
                                ? "fill-warning stroke-warning"
                                : "fill-success stroke-success"
                              : // In light mode empty beds pop *brighter* than the zone tint;
                                // fill-background would invert that in dark mode (near-black
                                // slits), so dark uses the lighter muted surface instead.
                                "fill-background dark:fill-muted stroke-foreground/40"
                          }
                          strokeWidth={isSelected ? 2.5 : 1}
                        />
                        {isSelected && (
                          <polygon
                            points={pointsStr}
                            fill="none"
                            className="stroke-primary"
                            strokeWidth="2.5"
                            strokeDasharray="0"
                          />
                        )}
                        {/* At-a-glance badge: day count + attention flag, kept
                            horizontal regardless of the bed's own angle */}
                        {occupied && (
                          <g transform={`translate(${cx}, ${cy})`}>
                            <rect
                              x={-12}
                              y={-6.5}
                              width={needsAttention ? 32 : 24}
                              height={13}
                              rx={3}
                              className={
                                needsAttention
                                  ? "fill-background/90 stroke-warning/60"
                                  : "fill-background/90 stroke-success/50"
                              }
                              strokeWidth="0.5"
                            />
                            <text
                              x={-9}
                              y={3.5}
                              className={
                                needsAttention
                                  ? "fill-warning text-[9px] font-semibold"
                                  : "fill-success text-[9px] font-semibold"
                              }
                            >
                              D{bed.occupant!.daysInBed}
                            </text>
                            {needsAttention && (
                              <g transform="translate(11, -4)">
                                <circle r={4.5} className="fill-warning" />
                                <text
                                  x={-1.4}
                                  y={1.8}
                                  className="fill-warning-foreground text-[6.5px] font-bold"
                                >
                                  !
                                </text>
                              </g>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Hover tooltip (mouse only) */}
              {tooltip && tooltipBed && (
                <div
                  className="pointer-events-none absolute z-20 max-w-[240px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
                >
                  <div className="font-semibold">{tooltipBed.code}</div>
                  {tooltipBed.occupant ? (
                    <>
                      <div className="mt-0.5">
                        {tooltipBed.occupant.orderNo} · {tooltipBed.occupant.productName}
                      </div>
                      <div className="text-muted-foreground">
                        Day {tooltipBed.occupant.daysInBed}
                        {tooltipBed.occupant.stageName ? ` · ${tooltipBed.occupant.stageName}` : ""}
                      </div>
                      {(tooltipBed.occupant.stale ||
                        tooltipBed.occupant.hasDeviation ||
                        tooltipBed.occupant.maintenanceOverdueCount > 0) && (
                        <div className="mt-1 font-medium text-warning">
                          {[
                            tooltipBed.occupant.stale && "Reading overdue",
                            tooltipBed.occupant.hasDeviation && "Deviation flagged",
                            ...MAINTENANCE_TASK_TYPES.filter(
                              (t) => tooltipBed.occupant!.maintenance[t].overdue
                            ).map((t) => `${MAINTENANCE_TASK_LABELS[t]} overdue`),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-0.5 text-muted-foreground">Empty</div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <div className="space-y-3" ref={detailRef}>
          {selected ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{selected.code}</h2>
                  <div className="flex items-center gap-1.5">
                    {selected.occupant?.stale && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Reading overdue
                      </Badge>
                    )}
                    {selected.occupant?.hasDeviation && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Deviation flagged
                      </Badge>
                    )}
                    {selected.occupant &&
                      MAINTENANCE_TASK_TYPES.filter((t) => selected.occupant!.maintenance[t].overdue).map((t) => (
                        <Badge key={t} variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {MAINTENANCE_TASK_LABELS[t]} overdue
                        </Badge>
                      ))}
                    <Badge variant={selected.occupant ? "default" : "outline"}>
                      {selected.occupant ? "Composting" : "Empty"}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.lengthFt}′ × {selected.widthFt}′ ·{" "}
                  {layout.zones.find((z) => z.id === selected.zoneId)?.name}
                </p>
                {selected.occupant ? (
                  <div className="mt-3 space-y-1 text-sm">
                    <div>
                      Order{" "}
                      <Link
                        href={`/production/${selected.occupant.orderId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {selected.occupant.orderNo}
                      </Link>
                    </div>
                    <div className="text-muted-foreground">{selected.occupant.productName}</div>
                    {selected.occupant.stageName && (
                      <div className="text-muted-foreground">Stage: {selected.occupant.stageName}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Day {selected.occupant.daysInBed} in this bed (since{" "}
                      {fmtDateTime(selected.occupant.assignedAt)})
                    </div>
                    {selected.occupant.latestReading ? (
                      <div className="text-xs text-muted-foreground">
                        Latest: {selected.occupant.latestReading.parameter}{" "}
                        {selected.occupant.latestReading.value}
                        {selected.occupant.latestReading.unit ?? ""} ·{" "}
                        {fmtDateTime(selected.occupant.latestReading.recordedAt)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No readings recorded yet</div>
                    )}
                    <div className="mt-3 space-y-1 border-t pt-2 text-xs">
                      <div className="font-medium text-muted-foreground">Maintenance</div>
                      {MAINTENANCE_TASK_TYPES.map((t) => {
                        const m = selected.occupant!.maintenance[t];
                        return (
                          <div key={t} className="flex items-center justify-between gap-2">
                            <span>{MAINTENANCE_TASK_LABELS[t]}</span>
                            <span className={m.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                              {m.lastDone ? `last ${fmtDateTime(m.lastDone)}` : "never logged"} · next{" "}
                              {fmtDateTime(m.nextDueAt)}
                            </span>
                          </div>
                        );
                      })}
                      <MaintenanceDialog
                        bedId={selected.id}
                        items={rawMaterialItems}
                        defaultItemId={defaultBioEnzymeItemId}
                        trigger={
                          <Button size="sm" variant="outline" className="mt-2">
                            Log Maintenance
                          </Button>
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Assign this bed from a production order&apos;s detail page.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Select a bed on the map to see its status and current order.
              </CardContent>
            </Card>
          )}

          {/* Zone summary */}
          {layout.zones.map((z) => {
            const zoneBeds = layout.beds.filter((b) => b.zoneId === z.id);
            const used = zoneBeds.filter((b) => b.occupant).length;
            return (
              <Card key={z.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{z.name}</span>
                    <span className="text-muted-foreground">
                      {used}/{zoneBeds.length} beds in use
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {zoneBeds.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => selectBed(b.id)}
                        className={`rounded px-1.5 py-0.5 font-mono text-xs transition-colors ${
                          b.occupant
                            ? b.occupant.stale || b.occupant.hasDeviation || b.occupant.maintenanceOverdueCount > 0
                              ? "bg-warning text-warning-foreground"
                              : "bg-success text-success-foreground"
                            : "border border-border text-muted-foreground hover:bg-accent"
                        } ${selected?.id === b.id ? "ring-2 ring-primary" : ""}`}
                      >
                        {b.code.split("-")[1]}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
