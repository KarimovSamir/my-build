import { notFound } from "next/navigation";

import type { OrderDetail } from "@/lib/types";

import { OrderDetailView } from "@/components/orders/order-detail";
import { ApiRequestError } from "@/lib/api";
import { serverApi } from "@/lib/api.server";
import { getSessionClaims } from "@/lib/session.server";

export const metadata = { title: "Заказ" };

/**
 * Детали заказа (ТЗ §7). Страница общая для обеих ролей: ответ API
 * ролезависимый, состав данных решает backend (ТЗ §4.1).
 *
 * Чужой и несуществующий заказ приходят одинаково — 404: backend намеренно
 * не подтверждает существование чужого заказа. Значит, и страница у них одна.
 */
export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;

  const [order, claims] = await Promise.all([loadOrder(id), getSessionClaims()]);

  return <OrderDetailView order={order} viewerId={claims?.userId ?? null} />;
}

async function loadOrder(id: string): Promise<OrderDetail> {
  try {
    return await serverApi.get<OrderDetail>(`/orders/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
