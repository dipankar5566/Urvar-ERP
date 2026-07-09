import type { InferSelectModel } from "drizzle-orm";
import type { bedMaintenanceLog, siteFeatures } from "@/db/schema";

export type BedMaintenanceLog = InferSelectModel<typeof bedMaintenanceLog>;
export type SiteFeature = InferSelectModel<typeof siteFeatures>;

// A point on the site plan in feet; y increases northward (the map
// renderer flips it for SVG).
export type Pt = [number, number];

// zones.polygon / site_features.polygon are stored as JSON [x,y][].
export function parsePolygon(json: string | null): Pt[] | null {
  if (!json) return null;
  const pts = JSON.parse(json) as Pt[];
  return Array.isArray(pts) && pts.length >= 3 ? pts : null;
}

export const MAINTENANCE_TASK_TYPES = ["watering", "turning", "bio_enzyme"] as const;
export type MaintenanceTaskType = (typeof MAINTENANCE_TASK_TYPES)[number];

// Hardcoded for this iteration per confirmed design decision — not
// user-configurable via UI. Revisit if intervals turn out to vary by
// product/season.
export const MAINTENANCE_INTERVAL_DAYS: Record<MaintenanceTaskType, number> = {
  watering: 7,
  turning: 10,
  bio_enzyme: 15,
};

export const MAINTENANCE_TASK_LABELS: Record<MaintenanceTaskType, string> = {
  watering: "Watering",
  turning: "Turning",
  bio_enzyme: "Bio-enzyme",
};
