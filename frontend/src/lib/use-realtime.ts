"use client";

import {
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
} from "react";

import { SocketContext } from "@/components/realtime/realtime-provider";
import { bindRefresh, bindRoom, createConnectionStore } from "@/lib/realtime-bindings";
import { socketMessages, type SocketEvent } from "@/lib/socket";

/**
 * Хуки поверх подключения из `RealtimeProvider` (ТЗ §8).
 *
 * Здесь только связь с React: когда подписаться и когда снять подписку. Сама
 * механика — перевход в комнату после обрыва, перечит пропущенного, повтор
 * устранимого отказа — живёт в чистом `lib/realtime-bindings.ts` и покрыта
 * тестами там.
 *
 * Правила, общие для всех:
 *
 * - Сокета может не быть (`null`) — до подключения и после ухода со страницы.
 *   Это не ошибка: экран работает и без real-time, данные ему даёт REST.
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

    return bindRefresh(socket, {
      events: key ? key.split(" ") : [],
      refresh: () => run(),
      accepts: (payload) => accept(payload),
    });
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

/**
 * Есть ли связь с сервером.
 *
 * `false` — сокет разорван дольше нескольких секунд. Нужно интерфейсу, чтобы
 * пользователь отличал «ничего не происходит» от «обновления не приходят».
 * На сервере всегда `true`: сокета там нет, и говорить не о чем.
 *
 * Через `useSyncExternalStore`, а не через состояние с эффектом: состояние
 * живёт в сокете, а `setState` в эффекте запрещён правилами React Compiler.
 */
export function useRealtimeOnline(): boolean {
  const socket = useSocket();
  const store = useMemo(() => createConnectionStore(socket), [socket]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => true);
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

    return bindRoom(socket, {
      subscribe,
      unsubscribe,
      payload: orderId === null ? {} : { orderId },
    });
  }, [socket, subscribe, unsubscribe, orderId, enabled]);
}
