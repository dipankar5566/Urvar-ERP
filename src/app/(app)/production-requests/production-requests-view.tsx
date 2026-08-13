"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/form-dialog";
import { dismissProductionRequest } from "@/modules/production/requests-actions";
import type { PendingProductionRequest } from "@/modules/production/queries";
import { fmtQty } from "@/lib/format";
import { fmtDateTime } from "@/lib/dates";

export function ProductionRequestsView({ requests }: { requests: PendingProductionRequest[] }) {
  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold">Production Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sales handoffs from CRM — a won quotation lands here for review. Convert to start a real
          production order (you still choose the formula, workflow, warehouse, supervisor, and
          shift), or dismiss it.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Requested Qty</TableHead>
              <TableHead>Quotation</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No pending requests from CRM.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.productName}</TableCell>
                <TableCell>
                  {fmtQty(r.requestedQty)} {r.uom}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.crmQuotationNumber ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.crmCustomerName ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Link
                    href={`/production?requestId=${r.id}&productId=${r.productId}&qty=${r.requestedQty}`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    Convert
                  </Link>
                  <FormDialog
                    title="Dismiss Request"
                    action={dismissProductionRequest}
                    submitLabel="Dismiss"
                    trigger={
                      <Button size="sm" variant="outline">
                        Dismiss
                      </Button>
                    }
                  >
                    <input type="hidden" name="requestId" value={r.id} />
                    <div className="space-y-2">
                      <Label htmlFor={`dismiss-reason-${r.id}`}>Reason</Label>
                      <Textarea id={`dismiss-reason-${r.id}`} name="reason" rows={2} required />
                    </div>
                  </FormDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
