import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { getDashboardData } from "@/modules/dashboard/queries";
import { QC_BADGE } from "@/modules/batches/badges";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = getDashboardData();

  const targetPct =
    data.monthTarget > 0 ? Math.min((data.monthProduction / data.monthTarget) * 100, 100) : null;

  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {user.name.split(" ")[0]}.
      </p>

      {/* KPI tiles */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's Production" value={fmtQty(data.todayProduction)} unit="ton" />
        <Kpi label="This Month" value={fmtQty(data.monthProduction)} unit="ton" />
        <Kpi
          label="Target vs Actual"
          value={targetPct === null ? "—" : `${targetPct.toFixed(0)}%`}
          unit={data.monthTarget > 0 ? `of ${fmtQty(data.monthTarget)} ton` : "no target set"}
        />
        <Kpi
          label="Avg Yield (month)"
          value={data.avgYield === null ? "—" : `${data.avgYield.toFixed(1)}%`}
          unit={data.avgYield === null ? "no batches yet" : ""}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
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
                        {o.productName} · {o.targetQty} {o.uom} · {o.supervisorName}
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

        {/* Low stock */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Low Stock Alerts</CardTitle>
            <Link
              href="/inventory"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Inventory <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All tracked items above reorder level.</p>
            ) : (
              <ul className="space-y-2">
                {data.lowStock.map((s) => (
                  <li key={s.itemName} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="font-medium">{s.itemName}</span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      {fmtQty(s.qty)} / {fmtQty(s.reorderLevel)} {s.uom}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> All clear
                </p>
              )}
          </CardContent>
        </Card>
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
                      {b.productName} · {b.qtyProduced} {b.uom} · yield {b.yieldPct.toFixed(1)}%
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

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {unit && <div className="mt-0.5 text-xs text-muted-foreground">{unit}</div>}
      </CardContent>
    </Card>
  );
}

function fmtQty(n: number): string {
  return Number(n.toFixed(2)).toLocaleString("en-IN");
}
