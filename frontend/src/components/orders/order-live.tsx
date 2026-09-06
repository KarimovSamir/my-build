"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { OrderDetail } from "@/lib/types";

import { OrderDetailView } from "@/components/orders/order-detail";
import { browserApi } from "@/lib/api.client";
import { ORDER_DETAIL_EVENTS, eventOrderId } from "@/lib/live-updates";
import { resolveOrderDetailAccess } from "@/lib/order-access";
import { useOrderRoom, useRealtimeRefresh } from "@/lib/use-realtime";

/**
 * Карточка заказа с живыми данными (ТЗ §7, §8).
 *
 * Заказ приходит со страницы уже посчитанным (приватность §4.1 — дело сервера),
 * а дальше живёт в состоянии этого компонента. Нужно это для двух вещей:
 *
 * - **Своё действие видно сразу.** Все шесть маршрутов сделки возвращают свежий
 *   `OrderDetail`, и после ответа карточка перерисовывается им, не дожидаясь
 *   серверного ре-рендера. Предсказаний нет — состояние заменяется тем, что
 *   действительно записал сервер, поэтому и откатывать нечего.
 * - **Чужое действие видно без перезагрузки.** События комнаты заказа
 *   перечитывают заказ одним GET, а не всю страницу.
 */
export function OrderLive({
  order: fromServer,
  viewerId,
}: {
  order: OrderDetail;
  /** Кто смотрит. `null` — сессия пропала между рендером и запросом. */
  viewerId: string | null;
}) {
  const router = useRouter();

  // Серверный рендер — источник правды при входе на страницу и после
  // `router.refresh()`. Сравнение по ссылке отличает «пришли новые данные»
  // от обычного перерисовывания, и делается это в рендере, а не в эффекте:
  // иначе кадр между ними показывал бы устаревший заказ.
  const [state, setState] = useState({ order: fromServer, server: fromServer });

  if (state.server !== fromServer) {
    setState({ order: fromServer, server: fromServer });
  }

  const order = state.order;
  const orderId = fromServer.id;

  const apply = useCallback(
    (next: OrderDetail) => setState((current) => ({ ...current, order: next })),
    [],
  );

  const reload = useCallback(() => {
    void browserApi.get<OrderDetail>(`/orders/${orderId}`).then(apply, () => {
      // Заказ мог исчезнуть (удалён клиентом) или перестать быть доступным.
      // Решать это должна страница: серверный рендер отдаст 404 как положено.
      router.refresh();
    });
  }, [orderId, apply, router]);

  const sync = useMemo<OrderSync>(() => ({ apply, reload }), [apply, reload]);

  // Правило членства в комнате — то же, что проверяет шлюз: владелец заказа
  // либо компания с активным предложением. `seesRealStatus` отвечает ровно
  // на этот вопрос, поэтому второй копии условия здесь не заводится.
  const isParticipant = resolveOrderDetailAccess(order, viewerId).seesRealStatus;

  useOrderRoom(orderId, isParticipant);
  useRealtimeRefresh(
    ORDER_DETAIL_EVENTS,
    reload,
    // В личную комнату клиента приходят события по всем его заказам —
    // на этой странице нужен только свой.
    useCallback((payload: unknown) => eventOrderId(payload) === orderId, [orderId]),
  );

  return (
    <OrderSyncContext value={sync}>
      <OrderDetailView order={order} viewerId={viewerId} />
    </OrderSyncContext>
  );
}

/** Как диалог сообщает карточке, что заказ изменился. */
export interface OrderSync {
  /** Мутация вернула свежий заказ — показать его немедленно. */
  apply: (order: OrderDetail) => void;
  /** Заказа в ответе нет либо запрос отказал — перечитать и сойтись с сервером. */
  reload: () => void;
}

const OrderSyncContext = createContext<OrderSync | null>(null);

/**
 * Обновление заказа из диалога.
 *
 * Диалоги предложения живут и на карточке заказа, и в списках (`/available`,
 * `/offers`), где никакого `OrderDetail` в состоянии нет. Вне карточки хук
 * отдаёт запасной вариант — перечитывание страницы целиком, то есть ровно то,
 * что списку и нужно.
 */
export function useOrderSync(): OrderSync {
  const router = useRouter();
  const fromCard = useContext(OrderSyncContext);

  return useMemo(
    () =>
      fromCard ?? {
        apply: () => router.refresh(),
        reload: () => router.refresh(),
      },
    [fromCard, router],
  );
}
