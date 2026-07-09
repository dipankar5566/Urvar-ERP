"use client";

// Shared recharts wrappers. Every chart in this app plots ONE entity's series
// at a time (a product, an item) — never multiple entities with different
// units on a shared axis. Colors come from the --chart-* theme tokens.

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtQty } from "@/lib/format";

export type DatePoint = { date: string; value: number };

export function DateAreaChart({
  data,
  unit,
  color = "var(--chart-1)",
  height = 220,
  step = false,
}: {
  data: DatePoint[];
  unit?: string;
  color?: string;
  height?: number;
  step?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={28}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => fmtQty(v)}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
                <div className="text-muted-foreground">{label}</div>
                <div className="font-medium">
                  {fmtQty(payload[0].value as number)} {unit ?? ""}
                </div>
              </div>
            ) : null
          }
        />
        <Area
          type={step ? "stepAfter" : "monotone"}
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.12}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Fill gaps in a sparse day → value map across the last `days` days.
// `carryForward` keeps the previous value on empty days (stock levels);
// otherwise empty days are zero (production output).
export function fillDays(
  byDate: Map<string, number>,
  days: number,
  carryForward: boolean,
  opening = 0
): DatePoint[] {
  const out: DatePoint[] = [];
  let level = opening;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const v = byDate.get(key);
    if (carryForward) {
      level += v ?? 0;
      out.push({ date: key, value: Number(level.toFixed(3)) });
    } else {
      out.push({ date: key, value: v ?? 0 });
    }
  }
  return out;
}
