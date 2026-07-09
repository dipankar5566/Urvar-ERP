import { requireUser } from "@/lib/session";
import { getBatches, getBatchCostYieldSeries } from "@/modules/batches/queries";
import { BatchesView } from "./batches-view";
import { CostYieldCard } from "./cost-yield-card";

export default async function BatchesPage() {
  await requireUser();
  return (
    <div>
      <BatchesView batches={getBatches()} />
      <CostYieldCard series={getBatchCostYieldSeries()} />
    </div>
  );
}
