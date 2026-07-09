"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import { createProductionOrder } from "@/modules/production/actions";
import type { OrderRow } from "@/modules/production/queries";
import type { Product, Formula, Warehouse, WorkflowTemplate } from "@/modules/masters/types";
import { fmtQty } from "@/lib/format";
import { STATUS_BADGE } from "@/modules/production/badges";

export function ProductionView({
  orders,
  products,
  formulas,
  templates,
  warehouses,
  supervisors,
}: {
  orders: OrderRow[];
  products: Product[];
  formulas: Formula[];
  templates: WorkflowTemplate[];
  warehouses: Warehouse[];
  supervisors: { id: number; name: string }[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [productId, setProductId] = useState<number>(products[0]?.id ?? 0);

  const productFormulas = formulas.filter((f) => f.productId === productId);
  const productTemplates = templates.filter((t) => !t.productId || t.productId === productId);
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Production</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders drive material issue, batches, and finished goods.
          </p>
        </div>
        <FormDialog
          title="New Production Order"
          action={createProductionOrder}
          submitLabel="Create Order"
          trigger={
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> New Order
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="po-product">Product</Label>
            <NativeSelect
              id="po-product"
              name="productId"
              value={productId}
              onChange={(e) => setProductId(Number(e.target.value))}
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-formula">Formula</Label>
            <NativeSelect id="po-formula" name="formulaId" required>
              {productFormulas.length === 0 && <option value="">No formula for this product</option>}
              {productFormulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-template">Workflow</Label>
            <NativeSelect id="po-template" name="templateId" required>
              {productTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="po-qty">Target quantity</Label>
              <Input id="po-qty" name="targetQty" type="number" min={0} step="any" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-wh">Warehouse</Label>
              <NativeSelect id="po-wh" name="warehouseId" required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="po-supervisor">Supervisor</Label>
              <NativeSelect id="po-supervisor" name="supervisorId" required>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-shift">Shift</Label>
              <NativeSelect id="po-shift" name="shift" defaultValue="general">
                <option value="general">General</option>
                <option value="day">Day</option>
                <option value="night">Night</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="po-start">Planned start</Label>
              <Input id="po-start" name="plannedStart" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-end">Planned end</Label>
              <Input id="po-end" name="plannedEnd" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-remarks">Remarks</Label>
            <Textarea id="po-remarks" name="remarks" rows={2} />
          </div>
        </FormDialog>
      </div>

      <div className="mt-6 flex gap-1.5">
        {["all", "draft", "in_progress", "completed", "cancelled"].map((s) => (
          <Button
            key={s}
            variant={filter === s ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(s)}
            className="capitalize"
          >
            {s === "all" ? "All" : STATUS_BADGE[s].label}
          </Button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current Stage</TableHead>
              <TableHead>Supervisor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No production orders yet.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) => {
              const badge = STATUS_BADGE[o.status];
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/production/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>{o.productName}</TableCell>
                  <TableCell>
                    {fmtQty(o.targetQty)} {o.uom}
                  </TableCell>
                  <TableCell>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.currentStage ?? "—"}</TableCell>
                  <TableCell className="text-sm">{o.supervisorName}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
