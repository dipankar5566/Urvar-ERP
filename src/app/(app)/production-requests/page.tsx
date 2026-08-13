import { requireUser } from "@/lib/session";
import { getPendingProductionRequests } from "@/modules/production/queries";
import { ProductionRequestsView } from "./production-requests-view";

export default async function ProductionRequestsPage() {
  await requireUser();
  const requests = await getPendingProductionRequests();
  return <ProductionRequestsView requests={requests} />;
}
