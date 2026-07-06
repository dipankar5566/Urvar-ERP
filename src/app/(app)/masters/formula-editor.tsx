"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form-dialog";
import { saveFormula } from "@/modules/masters/actions";
import { type Formula, type FormulaLine, type Product, type Item, UOMS } from "@/modules/masters/types";

type LineDraft = { itemId: number; qtyPerOutput: number };

export function FormulaEditor({
  formulas,
  formulaLines,
  products,
  items,
}: {
  formulas: Formula[];
  formulaLines: FormulaLine[];
  products: Product[];
  items: Item[];
}) {
  const inputItems = items.filter((i) => i.category !== "finished_good");

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FormulaDialog products={products} items={inputItems} trigger={
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add Formula
          </Button>
        } />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Inputs</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {formulas.map((f) => {
              const lines = formulaLines.filter((l) => l.formulaId === f.id);
              const product = products.find((p) => p.id === f.productId);
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{product?.name ?? "—"}</TableCell>
                  <TableCell>
                    {f.outputQty} {f.outputUom}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {lines
                      .map((l) => {
                        const item = items.find((i) => i.id === l.itemId);
                        return `${item?.name ?? "?"} × ${l.qtyPerOutput}${item ? ` ${item.uom}` : ""}`;
                      })
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    <FormulaDialog
                      formula={f}
                      existingLines={lines}
                      products={products}
                      items={inputItems}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FormulaDialog({
  formula,
  existingLines,
  products,
  items,
  trigger,
}: {
  formula?: Formula;
  existingLines?: FormulaLine[];
  products: Product[];
  items: Item[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(formula?.name ?? "");
  const [productId, setProductId] = useState<number>(formula?.productId ?? products[0]?.id ?? 0);
  const [outputQty, setOutputQty] = useState<number>(formula?.outputQty ?? 1);
  const [outputUom, setOutputUom] = useState<string>(formula?.outputUom ?? "ton");
  const [lines, setLines] = useState<LineDraft[]>(
    existingLines?.map((l) => ({ itemId: l.itemId, qtyPerOutput: l.qtyPerOutput })) ?? [
      { itemId: items[0]?.id ?? 0, qtyPerOutput: 1 },
    ]
  );

  function submit() {
    startTransition(async () => {
      const result = await saveFormula({
        id: formula?.id,
        name,
        productId,
        outputQty,
        outputUom,
        lines,
      });
      if (result.ok) {
        toast.success("Formula saved");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{trigger}</span>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{formula ? "Edit Formula" : "Add Formula"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-2">
              <Label>Product</Label>
              <NativeSelect value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Output qty</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={outputQty}
                onChange={(e) => setOutputQty(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <NativeSelect value={outputUom} onChange={(e) => setOutputUom(e.target.value)}>
                {UOMS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Inputs consumed per {outputQty || 1} {outputUom}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines([...lines, { itemId: items[0]?.id ?? 0, qtyPerOutput: 1 }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const item = items.find((i) => i.id === line.itemId);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <NativeSelect
                      className="flex-1"
                      value={line.itemId}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...line, itemId: Number(e.target.value) };
                        setLines(next);
                      }}
                    >
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      step="any"
                      value={line.qtyPerOutput}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = { ...line, qtyPerOutput: Number(e.target.value) };
                        setLines(next);
                      }}
                    />
                    <span className="w-10 text-xs text-muted-foreground">{item?.uom ?? ""}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove line"
                      disabled={lines.length === 1}
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
