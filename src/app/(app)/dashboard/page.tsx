import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getDashboardData } from "@/modules/dashboard/queries";
import { getVendors, getRateHistory } from "@/modules/procurement/queries";
import { fmtQty, fmtPct } from "@/lib/format";
import { QC_BADGE } from "@/modules/batches/badges";
import { StockAlertsCard } from "./stock-alerts-card";
import { MaintenanceAlertsCard } from "./maintenance-alerts-card";
import { ProductionTrendCard } from "./production-trend-card";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = getDashboardData();
  const vendors = getVendors();
  const rateHistory = getRateHistory();
  const purchasableItems = db
    .select()
    .from(items)
    .orderBy(asc(items.name))
    .all()
    .filter((i) => i.category !== "finished_good" && i.active);

  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {user.name.split(" ")[0]}.
      </p>

      {/* Production this month, per product — never summed across products,
          since different products have different units (ton/litre/kg). */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Production This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {data.productionByProduct.length === 0 ? (
            <p className="text-sm text-muted-foreground">No production activity yet this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">This Month</TableHead>
                    <TableHead className="text-right">Target vs Actual</TableHead>
                    <TableHead className="text-right">Avg Yield</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.productionByProduct.map((p) => {
                    const uom = p.uom ?? "";
                    const targetPct = p.monthTarget > 0 ? (p.monthQty / p.monthTarget) * 100 : null;
                    return (
                      <TableRow key={p.productId}>
                        <TableCell className="font-medium">{p.productName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtQty(p.todayQty)} {uom}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtQty(p.monthQty)} {uom}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {targetPct === null ? (
                            <span className="text-muted-foreground">no target set</span>
                          ) : (
                            `${fmtPct(targetPct, 0)} of ${fmtQty(p.monthTarget)} ${uom}`
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {p.avgYield === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            fmtPct(p.avgYield)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <ProductionTrendCard trend={data.productionTrend} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {/* Active orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Active Production</CardTitle>
            <Link
              href="/production"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              All orders <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.activeOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders in progress.</p>
            ) : (
              <ul className="space-y-3">
                {data.activeOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/production/${o.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.orderNo}
                      </Link>
                      <div className="truncate text-sm text-muted-foreground">
                        {o.productName} · {fmtQty(o.targetQty)} {o.uom} · {o.supervisorName}
                      </div>
                    </div>
                    <Badge variant="default" className="shrink-0">
                      {o.currentStage ?? "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Stock alerts: low stock (with a Quick-PO shortcut) + expiry */}
        <StockAlertsCard
          lowStock={data.lowStock}
          expiring={data.expiring}
          vendors={vendors}
          items={purchasableItems}
          rateHistory={rateHistory}
        />

        {/* Quality summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Quality</CardTitle>
            <Link
              href="/quality"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Quality <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Inspections pending</span>
              <span className="font-medium tabular-nums">{data.pendingInspections}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Batches awaiting QC</span>
              <span className="font-medium tabular-nums">{data.batchesAwaitingQC}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Batches on hold</span>
              <span
                className={`font-medium tabular-nums ${data.batchesOnHold > 0 ? "text-destructive" : ""}`}
              >
                {data.batchesOnHold}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Open CAPAs</span>
              <span className="font-medium tabular-nums">{data.openCapas}</span>
            </div>
            {data.pendingInspections === 0 &&
              data.batchesAwaitingQC === 0 &&
              data.batchesOnHold === 0 &&
              data.openCapas === 0 && (
                <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" /> All clear
                </p>
              )}
          </CardContent>
        </Card>

        {/* Bed maintenance: watering/turning/bio-enzyme overdue */}
        <MaintenanceAlertsCard alerts={data.maintenanceAlerts} />
      </div>

      {/* Recent batches */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Batches</CardTitle>
          <Link
            href="/batches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            All batches <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {data.recentBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No batches yet — complete a production order to create the first one.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.recentBatches.map((b) => {
                const qc = QC_BADGE[b.qcStatus];
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/batches/${b.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {b.batchNo}
                    </Link>
                    <span className="text-muted-foreground">
                      {b.productName} · {fmtQty(b.qtyProduced)} {b.uom} · yield {fmtPct(b.yieldPct)}
                    </span>
                    <Badge variant={qc.variant} className="ml-auto">
                      {qc.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
