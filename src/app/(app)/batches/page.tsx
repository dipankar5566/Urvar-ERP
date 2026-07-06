import { requireUser } from "@/lib/session";
import { getBatches } from "@/modules/batches/queries";
import { BatchesView } from "./batches-view";

export default async function BatchesPage() {
  await requireUser();
  return <BatchesView batches={getBatches()} />;
}
