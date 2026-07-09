"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MAINTENANCE_TASK_LABELS } from "@/modules/layout/types";
import type { DashboardData } from "@/modules/dashboard/queries";

export function MaintenanceAlertsCard({ alerts }: { alerts: DashboardData["maintenanceAlerts"] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Bed Maintenance</CardTitle>
        <Link
          href="/layout-map"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Site Layout <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All beds up to date.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 5).map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="font-medium">{a.bedCode}</span>
                <span className="text-muted-foreground">{MAINTENANCE_TASK_LABELS[a.taskType]}</span>
                <span className="ml-auto text-xs text-muted-foreground">{a.orderNo}</span>
              </li>
            ))}
            {alerts.length > 5 && (
              <li className="text-xs text-muted-foreground">+{alerts.length - 5} more</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
