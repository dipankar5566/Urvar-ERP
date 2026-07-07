"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus } from "lucide-react";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import {
  recordLotInspection,
  createCapa,
  updateCapa,
  closeCapa,
} from "@/modules/quality/actions";
import { LOT_QC_BADGE, CAPA_STATUS_BADGE } from "@/modules/quality/badges";
import { QC_BADGE } from "@/modules/batches/badges";
import { fmtDateTime } from "@/lib/dates";
import type { LotForInspection, BatchForQC, CapaRow } from "@/modules/quality/queries";

export function QualityView({
  lots,
  batches,
  capas,
  users,
}: {
  lots: LotForInspection[];
  batches: BatchForQC[];
  capas: CapaRow[];
  users: { id: number; name: string }[];
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold">Quality</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Incoming inspection, batch testing, and corrective/preventive actions.
      </p>

      <Tabs defaultValue="incoming" className="mt-6">
        <TabsList>
          <TabsTrigger value="incoming">Incoming Inspection</TabsTrigger>
          <TabsTrigger value="testing">Batch Testing</TabsTrigger>
          <TabsTrigger value="capa">CAPA</TabsTrigger>
        </TabsList>

        {/* ---------- Incoming Inspection ---------- */}
        <TabsContent value="incoming" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>QC Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No goods receipts yet.
                    </TableCell>
                  </TableRow>
                )}
                {lots.map((l) => {
                  const badge = LOT_QC_BADGE[l.qcStatus];
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">{l.lotNo}</TableCell>
                      <TableCell className="font-medium">{l.itemName}</TableCell>
                      <TableCell>{l.supplierName}</TableCell>
                      <TableCell>{l.receivedDate}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <InspectDialog lot={l} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------- Batch Testing ---------- */}
        <TabsContent value="testing" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Mfg Date</TableHead>
                  <TableHead>QC Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No batches yet.
                    </TableCell>
                  </TableRow>
                )}
                {batches.map((b) => {
                  const badge = QC_BADGE[b.qcStatus];
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/batches/${b.id}`} className="font-medium text-primary hover:underline">
                          {b.batchNo}
                        </Link>
                      </TableCell>
                      <TableCell>{b.productName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.orderNo}</TableCell>
                      <TableCell>{b.mfgDate}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Open a batch to collect a sample, run tests, and release or hold it.
          </p>
        </TabsContent>

        {/* ---------- CAPA ---------- */}
        <TabsContent value="capa" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <CapaCreateDialog batches={batches} users={users} />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CAPA</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Linked Batch</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {capas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No CAPAs recorded.
                    </TableCell>
                  </TableRow>
                )}
                {capas.map((c) => {
                  const badge = CAPA_STATUS_BADGE[c.status];
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.capaNo}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.issue}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.linkedBatchNo ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.responsibleName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.deadline ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="space-x-1">
                        <CapaEditDialog capa={c} users={users} />
                        {c.status !== "closed" && <CapaCloseDialog capa={c} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InspectDialog({ lot }: { lot: LotForInspection }) {
  const alreadyInspected = lot.qcStatus !== "pending";
  return (
    <FormDialog
      title={`Inspect ${lot.lotNo}`}
      action={recordLotInspection}
      submitLabel="Save Inspection"
      trigger={
        <Button size="sm" variant={alreadyInspected ? "ghost" : "outline"}>
          {alreadyInspected ? "Re-inspect" : "Inspect"}
        </Button>
      }
    >
      <input type="hidden" name="lotId" value={lot.id} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="insp-moisture">Moisture %</Label>
          <Input id="insp-moisture" name="moisturePct" type="number" min={0} max={100} step="any" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="insp-foreign">Foreign Matter %</Label>
          <Input id="insp-foreign" name="foreignMatterPct" type="number" min={0} max={100} step="any" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="insp-odour">Odour</Label>
          <NativeSelect id="insp-odour" name="odour" defaultValue="">
            <option value="">—</option>
            <option value="normal">Normal</option>
            <option value="off">Off</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="insp-visual">Visual Condition</Label>
          <NativeSelect id="insp-visual" name="visualCondition" defaultValue="">
            <option value="">—</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="insp-result">Result</Label>
        <NativeSelect id="insp-result" name="result" defaultValue="accepted" required>
          <option value="accepted">Accept</option>
          <option value="rejected">Reject</option>
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="insp-remarks">Remarks</Label>
        <Textarea id="insp-remarks" name="inspectionRemarks" rows={2} />
      </div>
    </FormDialog>
  );
}

function CapaCreateDialog({
  batches,
  users,
}: {
  batches: BatchForQC[];
  users: { id: number; name: string }[];
}) {
  return (
    <FormDialog
      title="New CAPA"
      action={createCapa}
      submitLabel="Create"
      trigger={
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> New CAPA
        </Button>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="capa-issue">Issue</Label>
        <Textarea id="capa-issue" name="issue" rows={2} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="capa-batch">Linked batch (optional)</Label>
          <NativeSelect id="capa-batch" name="linkedBatchId" defaultValue="">
            <option value="">None</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchNo}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="capa-responsible">Responsible</Label>
          <NativeSelect id="capa-responsible" name="responsibleUserId" defaultValue="">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="capa-deadline">Deadline</Label>
        <Input id="capa-deadline" name="deadline" type="date" />
      </div>
    </FormDialog>
  );
}

function CapaEditDialog({
  capa,
  users,
}: {
  capa: CapaRow;
  users: { id: number; name: string }[];
}) {
  return (
    <FormDialog
      title={capa.capaNo}
      action={updateCapa}
      submitLabel="Save"
      trigger={
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      }
    >
      <input type="hidden" name="capaId" value={capa.id} />
      <div className="space-y-2">
        <Label htmlFor="capa-root">Root Cause</Label>
        <Textarea id="capa-root" name="rootCause" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="capa-corrective">Corrective Action</Label>
        <Textarea id="capa-corrective" name="correctiveAction" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="capa-preventive">Preventive Action</Label>
        <Textarea id="capa-preventive" name="preventiveAction" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="capa-responsible-edit">Responsible</Label>
          <NativeSelect id="capa-responsible-edit" name="responsibleUserId" defaultValue="">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="capa-deadline-edit">Deadline</Label>
          <Input id="capa-deadline-edit" name="deadline" type="date" defaultValue={capa.deadline ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="capa-status">Status</Label>
        <NativeSelect id="capa-status" name="status" defaultValue={capa.status}>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="verification">Verification</option>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          Use the Close action separately once verified — closing requires
          verification notes.
        </p>
      </div>
    </FormDialog>
  );
}

function CapaCloseDialog({ capa }: { capa: CapaRow }) {
  return (
    <FormDialog
      title={`Close ${capa.capaNo}`}
      action={closeCapa}
      submitLabel="Close CAPA"
      trigger={
        <Button size="sm" variant="outline">
          Close
        </Button>
      }
    >
      <input type="hidden" name="capaId" value={capa.id} />
      <div className="space-y-2">
        <Label htmlFor="capa-verify">Verification notes (required)</Label>
        <Textarea id="capa-verify" name="verificationNotes" rows={3} required />
      </div>
    </FormDialog>
  );
}
