import { requireUser } from "@/lib/session";
import { getBedLayout } from "@/modules/layout/queries";
import { LayoutView } from "./layout-view";

export default async function LayoutPage() {
  await requireUser();
  const layout = getBedLayout();
  return <LayoutView layout={layout} />;
}
