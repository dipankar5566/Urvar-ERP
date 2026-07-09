"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/form-dialog";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { BatchCostYieldRow } from "@/modules/batches/queries";

export function CostYieldCard({ series }: { series: BatchCostYieldRow[] }) {
  // One product at a time — ₹/ton and ₹/litre don't belong on one axis.
  const productList = useMemo(() => {
    const seen = new Map<number, { productId: number; productName: string; uom: string; n: number }>();
    for (const r of series) {
      const p = seen.get(r.productId) ?? { productId: r.productId, productName: r.productName, uom: r.uom, n: 0 };
      p.n += 1;
      seen.set(r.productId, p);
    }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  }, [series]);

  const [productId, setProductId] = useState<number | null>(null);
  const active = productList.find((p) => p.productId === productId) ?? productList[0] ?? null;

  const data = useMemo(
    () =>
      active
        ? series
            .filter((r) => r.productId === active.productId)
            .map((r) => ({
              batchNo: r.batchNo,
              // Show just the date+seq tail of "UV-XXX-YYMMDD-NN"
              shortNo: r.batchNo.split("-").slice(-2).join("-"),
              costPerUnit: r.costPerUnit,
              yieldPct: r.yieldPct,
              costPartial: r.costPartial,
            }))
        : [],
    [series, active]
  );
  const anyPartial = data.some((d) => d.costPartial);

  if (!active) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Cost &amp; Yield per Batch</CardTitle>
        {productList.length > 1 && (
          <NativeSelect
            className="max-w-[220px]"
            aria-label="Product"
            value={active.productId}
            onChange={(e) => setProductId(Number(e.target.value))}
          >
            {productList.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.productName}
              </option>
            ))}
          </NativeSelect>
        )}
      </CardHeader>
      <CardContent>
        {anyPartial && (
          <p className="mb-2 text-xs text-warning">
            Some batches have inputs with no recorded rate — their cost bars understate the real
            cost.
          </p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="shortNo"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={12}
            />
            <YAxis
              yAxisId="cost"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => fmtMoney(v)}
            />
            <YAxis
              yAxisId="yield"
              orientation="right"
              domain={[0, 120]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={({ active: tActive, payload, label }) =>
                tActive && payload?.length ? (
                  <div className="rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
                    <div className="text-muted-foreground">{label}</div>
                    {payload.map((p) => (
                      <div key={p.dataKey as string} className="font-medium">
                        {p.dataKey === "costPerUnit"
                          ? `${fmtMoney(p.value as number)} / ${active.uom}`
                          : `Yield ${fmtPct(p.value as number)}`}
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Bar
              yAxisId="cost"
              dataKey="costPerUnit"
              fill="var(--chart-3)"
              fillOpacity={0.75}
              radius={[3, 3, 0, 0]}
              maxBarSize={36}
            />
            <Line
              yAxisId="yield"
              type="monotone"
              dataKey="yieldPct"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--chart-2)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
