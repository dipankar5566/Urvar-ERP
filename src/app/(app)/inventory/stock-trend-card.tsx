"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/form-dialog";
import { DateAreaChart, fillDays } from "@/components/charts";
import type { StockTrend } from "@/modules/inventory/queries";

const DAYS = 60;

export function StockTrendCard({ trend }: { trend: StockTrend }) {
  // One item at a time — items have different units, so their levels never
  // share an axis. Level = opening balance + cumulative daily net movement.
  const itemList = useMemo(() => {
    const seen = new Map<number, { itemId: number; itemName: string; uom: string; activity: number }>();
    for (const r of trend.daily) {
      const it = seen.get(r.itemId) ?? { itemId: r.itemId, itemName: r.itemName, uom: r.uom, activity: 0 };
      it.activity += Math.abs(r.qty);
      seen.set(r.itemId, it);
    }
    for (const r of trend.opening) {
      if (!seen.has(r.itemId)) {
        seen.set(r.itemId, { itemId: r.itemId, itemName: r.itemName, uom: r.uom, activity: 0 });
      }
    }
    return [...seen.values()].sort((a, b) => b.activity - a.activity || a.itemName.localeCompare(b.itemName));
  }, [trend]);

  const [itemId, setItemId] = useState<number | null>(null);
  const active = itemList.find((i) => i.itemId === itemId) ?? itemList[0] ?? null;

  const data = useMemo(() => {
    if (!active) return [];
    const opening = trend.opening.find((o) => o.itemId === active.itemId)?.qty ?? 0;
    const byDate = new Map<string, number>();
    for (const r of trend.daily) {
      if (r.itemId === active.itemId) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.qty);
    }
    return fillDays(byDate, DAYS, true, opening);
  }, [trend, active]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Stock Level (60 days)</CardTitle>
        {itemList.length > 0 && (
          <NativeSelect
            className="max-w-[240px]"
            aria-label="Item"
            value={active?.itemId ?? ""}
            onChange={(e) => setItemId(Number(e.target.value))}
          >
            {itemList.map((i) => (
              <option key={i.itemId} value={i.itemId}>
                {i.itemName}
              </option>
            ))}
          </NativeSelect>
        )}
      </CardHeader>
      <CardContent>
        {active ? (
          <DateAreaChart data={data} unit={active.uom} color="var(--chart-2)" step />
        ) : (
          <p className="text-sm text-muted-foreground">No stock movement recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
