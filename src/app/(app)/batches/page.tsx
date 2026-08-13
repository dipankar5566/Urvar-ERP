import { requireUser } from "@/lib/session";
import { getBatches, getBatchCostYieldSeries } from "@/modules/batches/queries";
import { BatchesView } from "./batches-view";
import { CostYieldCard } from "./cost-yield-card";

export default async function BatchesPage() {
  await requireUser();
  const batches = await getBatches();
  const series = await getBatchCostYieldSeries();
  return (
    <div>
      <BatchesView batches={batches} />
      <CostYieldCard series={series} />
    </div>
  );
}
