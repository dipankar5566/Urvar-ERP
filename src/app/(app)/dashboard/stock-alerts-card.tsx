"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PODialog } from "@/app/(app)/procurement/procurement-view";
import type { Vendor, Item } from "@/modules/masters/types";
import type { RateHistoryRow } from "@/modules/procurement/queries";
import type { DashboardData } from "@/modules/dashboard/queries";
import { fmtQty } from "@/lib/format";

export function StockAlertsCard({
  lowStock,
  expiring,
  vendors,
  items,
  rateHistory,
}: {
  lowStock: DashboardData["lowStock"];
  expiring: DashboardData["expiring"];
  vendors: Vendor[];
  items: Item[];
  rateHistory: RateHistoryRow[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Stock Alerts</CardTitle>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Inventory <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Low Stock</div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All tracked items above reorder level.</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((s) => (
                <li key={s.itemId} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="font-medium">{s.itemName}</span>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {fmtQty(s.qty)} / {fmtQty(s.reorderLevel)} {s.uom}
                  </span>
                  {vendors.length > 0 && (
                    <PODialog
                      vendors={vendors}
                      items={items}
                      rateHistory={rateHistory}
                      initialItemId={s.itemId}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Order ${s.itemName}`}>
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Expiring Soon</div>
          {expiring.expired.length === 0 && expiring.nearExpiry.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing expired or expiring within 90 days.</p>
          ) : (
            <ul className="space-y-2">
              {expiring.expired.slice(0, 3).map((b) => (
                <li key={b.batchId} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="font-medium">{b.batchNo}</span>
                  <span className="ml-auto font-mono text-destructive">
                    {Math.abs(b.daysUntilExpiry)}d overdue
                  </span>
                </li>
              ))}
              {expiring.nearExpiry.slice(0, 3).map((b) => (
                <li key={b.batchId} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-medium">{b.batchNo}</span>
                  <span className="ml-auto font-mono text-muted-foreground">{b.daysUntilExpiry}d left</span>
                </li>
              ))}
              {expiring.expired.length + expiring.nearExpiry.length > 6 && (
                <li className="text-xs text-muted-foreground">
                  +{expiring.expired.length + expiring.nearExpiry.length - 6} more —{" "}
                  <Link href="/inventory" className="underline hover:text-foreground">
                    view all
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
