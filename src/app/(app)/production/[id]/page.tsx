import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getOrderDetail } from "@/modules/production/queries";
import { getBedsWithAvailability, getOrderBedIds } from "@/modules/layout/queries";
import { OrderDetailView } from "./order-detail-view";

export default async function OrderDetailPage(props: PageProps<"/production/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const orderId = Number(id);
  const detail = getOrderDetail(orderId);
  if (!detail) notFound();

  const bedOptions = getBedsWithAvailability(orderId);
  const assignedBedIds = getOrderBedIds(orderId);

  return (
    <OrderDetailView detail={detail} bedOptions={bedOptions} assignedBedIds={assignedBedIds} />
  );
}
