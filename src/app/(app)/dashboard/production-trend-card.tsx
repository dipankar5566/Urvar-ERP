"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/form-dialog";
import { DateAreaChart, fillDays } from "@/components/charts";
import type { DashboardData } from "@/modules/dashboard/queries";

const DAYS = 30;

export function ProductionTrendCard({ trend }: { trend: DashboardData["productionTrend"] }) {
  // One product at a time — products have different units (ton/litre/kg), so
  // their series never share an axis.
  const productList = useMemo(() => {
    const seen = new Map<number, { productId: number; productName: string; uom: string; total: number }>();
    for (const r of trend) {
      const p = seen.get(r.productId) ?? { ...r, total: 0 };
      p.total += r.qty;
      seen.set(r.productId, p);
    }
    return [...seen.values()].sort((a, b) => b.total - a.total);
  }, [trend]);

  const [productId, setProductId] = useState<number | null>(null);
  const active = productList.find((p) => p.productId === productId) ?? productList[0] ?? null;

  const data = useMemo(() => {
    if (!active) return [];
    const byDate = new Map<string, number>();
    for (const r of trend) {
      if (r.productId === active.productId) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.qty);
    }
    return fillDays(byDate, DAYS, false);
  }, [trend, active]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Production Trend (30 days)</CardTitle>
        {productList.length > 1 && (
          <NativeSelect
            className="max-w-[220px]"
            aria-label="Product"
            value={active?.productId ?? ""}
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
        {active ? (
          <DateAreaChart data={data} unit={active.uom} />
        ) : (
          <p className="text-sm text-muted-foreground">No production in the last 30 days.</p>
        )}
      </CardContent>
    </Card>
  );
}
