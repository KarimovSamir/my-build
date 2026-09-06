"use client";

import { useContext, useEffect, useEffectEvent } from "react";

import { SocketContext } from "@/components/realtime/realtime-provider";
import { createBurst } from "@/lib/live-updates";
import { socketMessages, type SocketEvent, type SubscribeAck } from "@/lib/socket";

/**
 * Хуки поверх подключения из `RealtimeProvider` (ТЗ §8).
 *
 * Правила, общие для всех:
 *
 * - Сокета может не быть (`null`) — до подключения и после ухода со страницы.
 *   Это не ошибка: экран работает и без real-time, данные ему даёт REST.
 * - Подписка на комнату восстанавливается после переподключения. Комнаты живут
 *   на сервере, и обрыв связи они не переживают: переподключившийся сокет —
 *   новый участник, о котором сервер ничего не помнит.
 * - Обработчики оборачиваются в `useEffectEvent`: слушатели сокета не должны
 *   пересаживаться из-за того, что страница перерисовалась и передала новую
 *   функцию, но вызываться должна всегда последняя.
 */

/** Текущее подключение или `null`. */
export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Перечитать данные по событиям сокета.
 *
 * `accepts` отсеивает чужое: в личную комнату пользователя приходят события
 * по всем его заказам, и открытая карточка одного заказа не должна
 * перечитываться из-за движения соседнего.
 */
export function useRealtimeRefresh(
  events: readonly SocketEvent[],
  refresh: () => void,
  accepts?: (payload: unknown) => boolean,
): void {
  const socket = useSocket();

  const run = useEffectEvent(() => refresh());
  const accept = useEffectEvent((payload: unknown) => !accepts || accepts(payload));

  // Список событий приходит пропом и на каждом рендере может быть новым
  // массивом с тем же составом. Пересаживать слушателей из-за этого незачем,
  // поэтому эффект зависит от состава, а не от ссылки; имена событий —
  // `order:created` и подобные, пробелов в них нет.
  const key = events.join(" ");

  useEffect(() => {
    if (!socket) return;

    const names = (key ? key.split(" ") : []) as SocketEvent[];
    const burst = createBurst(() => run());

    const handle = (payload: unknown) => {
      if (accept(payload)) burst.schedule();
    };

    for (const name of names) {
      socket.on(name, handle);
    }

    return () => {
      burst.cancel();

      for (const name of names) {
        socket.off(name, handle);
      }
    };
  }, [socket, key]);
}

/**
 * Комната заказа — участникам (ТЗ §8, §4.1).
 *
 * `enabled` считается по тому же правилу, что проверяет шлюз: владелец заказа
 * либо компания с активным предложением. Просить комнату, зная, что не пустят,
 * незачем: отказ был бы законным, но писал бы в консоль на каждое открытие
 * чужого заказа.
 */
export function useOrderRoom(orderId: string, enabled: boolean): void {
  useRoom(
    socketMessages.subscribeOrder,
    socketMessages.unsubscribeOrder,
    orderId,
    enabled,
  );
}

/** Лента доступных заказов — только компаниям (ТЗ §8). */
export function useCompanyFeed(enabled: boolean): void {
  useRoom(socketMessages.subscribeFeed, socketMessages.unsubscribeFeed, null, enabled);
}

/** Общая механика обеих подписок: вход при подключении, выход при уходе. */
function useRoom(
  subscribe: string,
  unsubscribe: string,
  /** Заказ, если комната про заказ. У ленты его нет. */
  orderId: string | null,
  enabled: boolean,
): void {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !enabled) return;

    const payload = orderId === null ? {} : { orderId };

    const join = () => {
      socket.emit(subscribe, payload, (ack: SubscribeAck) => {
        if (!ack.ok) {
          console.warn(`WebSocket: ${ack.error ?? "в комнату не пустили"}`);
        }
      });
    };

    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);

      // Отписываться имеет смысл только у живого сокета: оборванный уже выпал
      // из всех комнат, а сообщение легло бы в очередь до переподключения.
      if (socket.connected) socket.emit(unsubscribe, payload);
    };
  }, [socket, subscribe, unsubscribe, orderId, enabled]);
}
