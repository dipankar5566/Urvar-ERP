"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PLOT_BOUNDARY,
  ZONE1_POLY,
  ZONE2_POLY,
  STRIP_POLY,
  MACHINE_SHED_RECT,
  type Pt,
} from "@/modules/layout/site-geometry";
import type { BedLayout, LayoutBed } from "@/modules/layout/queries";
import { fmtDateTime } from "@/lib/dates";

// Site-plan feet → SVG px. y is flipped (plan y grows north, SVG y grows down).
const PAD = 14;
const SCALE = 2.4;

const xs = PLOT_BOUNDARY.map((p) => p[0]);
const ys = PLOT_BOUNDARY.map((p) => p[1]);
const minX = Math.min(...xs);
const maxY = Math.max(...ys);
const W = (Math.max(...xs) - minX) * SCALE + PAD * 2;
const H = (maxY - Math.min(...ys)) * SCALE + PAD * 2;

function px(p: Pt): [number, number] {
  return [(p[0] - minX) * SCALE + PAD, (maxY - p[1]) * SCALE + PAD];
}

function poly(points: Pt[]): string {
  return points.map((p) => px(p).join(",")).join(" ");
}

export function LayoutView({ layout }: { layout: BedLayout }) {
  const [selected, setSelected] = useState<LayoutBed | null>(null);

  const occupiedCount = layout.beds.filter((b) => b.occupant).length;
  const zone1Count = layout.beds.filter((b) => b.zoneId === layout.zones.find((z) => z.code === "Z1")?.id).length;
  const zone2Count = layout.beds.filter((b) => b.zoneId === layout.zones.find((z) => z.code === "Z2")?.id).length;

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
        return { bed: b, corners: corners.map(px) };
      }),
    [layout.beds]
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Site Layout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kisanbandhu plant — {layout.beds.length} vermicompost beds ({occupiedCount} occupied).
            Click a bed for details.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-border bg-muted" /> Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" /> Composting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-sky-600 bg-sky-500/15" /> Shed
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="mx-auto h-auto w-full max-w-3xl"
                role="img"
                aria-label="Site layout with vermicompost beds"
              >
                {/* Plot boundary */}
                <polygon
                  points={poly(PLOT_BOUNDARY)}
                  className="fill-muted/30 stroke-foreground/60"
                  strokeWidth="1.5"
                />
                {/* Access strip */}
                <polygon
                  points={poly(STRIP_POLY)}
                  className="fill-muted/50 stroke-foreground/20"
                  strokeWidth="0.75"
                />
                {/* Zones */}
                <polygon
                  points={poly(ZONE1_POLY)}
                  className="fill-emerald-500/10 stroke-emerald-600/50"
                  strokeWidth="1"
                />
                <polygon
                  points={poly(ZONE2_POLY)}
                  className="fill-orange-500/10 stroke-orange-600/50"
                  strokeWidth="1"
                />

                {/* Machine Shed & Godown */}
                <polygon
                  points={poly(MACHINE_SHED_RECT)}
                  className="fill-sky-500/15 stroke-sky-600"
                  strokeWidth="1.25"
                />
                <text
                  x={px([MACHINE_SHED_RECT[0][0] + 2, (MACHINE_SHED_RECT[0][1] + MACHINE_SHED_RECT[2][1]) / 2 + 2])[0]}
                  y={px([MACHINE_SHED_RECT[0][0] + 2, (MACHINE_SHED_RECT[0][1] + MACHINE_SHED_RECT[2][1]) / 2 + 2])[1]}
                  className="fill-sky-700 dark:fill-sky-400 text-[9px] font-semibold"
                >
                  Machine Shed
                </text>
                <text
                  x={px([MACHINE_SHED_RECT[0][0] + 2, (MACHINE_SHED_RECT[0][1] + MACHINE_SHED_RECT[2][1]) / 2 - 4])[0]}
                  y={px([MACHINE_SHED_RECT[0][0] + 2, (MACHINE_SHED_RECT[0][1] + MACHINE_SHED_RECT[2][1]) / 2 - 4])[1]}
                  className="fill-sky-700 dark:fill-sky-400 text-[9px] font-semibold"
                >
                  &amp; Godown
                </text>

                {/* Zone labels */}
                <text x={px([150, 108])[0]} y={px([150, 108])[1]} className="fill-emerald-700 dark:fill-emerald-500 text-[13px] font-semibold">
                  Zone 1 · {zone1Count} beds
                </text>
                <text x={px([-58, -190])[0]} y={px([-58, -190])[1]} className="fill-orange-700 dark:fill-orange-500 text-[13px] font-semibold">
                  Zone 2 · {zone2Count} beds
                </text>

                {/* Beds — each a quadrilateral at its exact surveyed angle */}
                {bedPolys.map(({ bed, corners }) => {
                  const occupied = !!bed.occupant;
                  const isSelected = selected?.id === bed.id;
                  const pointsStr = corners.map((c) => c.join(",")).join(" ");
                  return (
                    <g
                      key={bed.id}
                      onClick={() => setSelected(bed)}
                      className="cursor-pointer"
                      role="button"
                      aria-label={`Bed ${bed.code}${occupied ? `, occupied by ${bed.occupant!.orderNo}` : ", empty"}`}
                    >
                      <polygon
                        points={pointsStr}
                        className={
                          occupied
                            ? "fill-emerald-600 stroke-emerald-700"
                            : "fill-background stroke-foreground/40"
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
                    </g>
                  );
                })}
              </svg>
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <div className="space-y-3">
          {selected ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{selected.code}</h2>
                  <Badge variant={selected.occupant ? "default" : "outline"}>
                    {selected.occupant ? "Composting" : "Empty"}
                  </Badge>
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
                    {selected.occupant.startedAt && (
                      <div className="text-xs text-muted-foreground">
                        Started {fmtDateTime(selected.occupant.startedAt)}
                      </div>
                    )}
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
                        onClick={() => setSelected(b)}
                        className={`rounded px-1.5 py-0.5 font-mono text-xs transition-colors ${
                          b.occupant
                            ? "bg-emerald-600 text-white"
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
