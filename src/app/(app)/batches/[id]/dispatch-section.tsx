"use client";

import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/form-dialog";
import { markBatchDispatched } from "@/modules/batches/actions";

const DISPATCH_BADGE: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  in_stock: { label: "In Stock", variant: "outline" },
  partial: { label: "Partially Dispatched", variant: "default" },
  dispatched: { label: "Dispatched", variant: "secondary" },
};

export function DispatchSection({
  batchId,
  qcStatus,
  dispatchStatus,
  uom,
}: {
  batchId: number;
  qcStatus: string;
  dispatchStatus: string;
  uom: string;
}) {
  const badge = DISPATCH_BADGE[dispatchStatus] ?? DISPATCH_BADGE.in_stock;
  const canDispatch = qcStatus === "released" && dispatchStatus !== "dispatched";

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Dispatch</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {canDispatch && (
            <FormDialog
              title="Mark Dispatched"
              action={markBatchDispatched}
              submitLabel="Mark Dispatched"
              trigger={
                <Button size="sm">
                  <Truck className="mr-1 h-3.5 w-3.5" /> Mark Dispatched
                </Button>
              }
            >
              <input type="hidden" name="batchId" value={batchId} />
              <div className="space-y-2">
                <Label htmlFor="dispatch-qty">Quantity ({uom})</Label>
                <Input id="dispatch-qty" name="qty" type="number" min={0} step="any" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispatch-remarks">Remarks</Label>
                <Textarea id="dispatch-remarks" name="remarks" rows={2} />
              </div>
            </FormDialog>
          )}
        </div>
      </CardHeader>
      {!canDispatch && qcStatus !== "released" && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Batch must be QC-released before it can be dispatched.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
