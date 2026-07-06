import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getOrderDetail } from "@/modules/production/queries";
import { OrderDetailView } from "./order-detail-view";

export default async function OrderDetailPage(props: PageProps<"/production/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const detail = getOrderDetail(Number(id));
  if (!detail) notFound();

  return <OrderDetailView detail={detail} />;
}
