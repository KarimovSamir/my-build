/**
 * Что каждая страница перечитывает по событиям сокета (ТЗ §8).
 *
 * Модуль чистый: ни React, ни socket.io. Здесь только два решения, и оба
 * стоят того, чтобы их проверял тест, а не глаз по разметке:
 *
 * 1. Какие события какому экрану важны. Ошибиться легко в обе стороны: забыть
 *    событие — экран замрёт, добавить лишнее — страница будет перечитываться
 *    на каждый чих.
 * 2. Что делать, когда событий приходит пачка. Одно действие рождает их
 *    несколько (принятие предложения — статус заказа, статусы проигравших
 *    предложений и уведомления), а перечитывать надо один раз.
 */

import { socketEvents, type SocketEvent } from "@/lib/types";

/**
 * Карточка заказа. Всё, что меняет её содержимое: статус, предложения, файлы
 * сдач и уточнённая площадь.
 *
 * `notification:created` сюда не входит: уведомление — следствие того же
 * действия, о котором уже сказало событие про заказ, и слушать оба значило бы
 * перечитывать страницу дважды.
 */
export const ORDER_DETAIL_EVENTS: readonly SocketEvent[] = [
  socketEvents.orderStatusChanged,
  socketEvents.offerCreated,
  socketEvents.offerUpdated,
  socketEvents.offerStatusChanged,
  socketEvents.orderFilesUpdated,
  socketEvents.orderAreaVerified,
];

/**
 * Список заказов клиента. В таблице видны статус, подрядчик, цена и срок —
 * всё это меняется ровно переходом статуса, который приходит клиенту
 * в его личную комнату.
 */
export const ORDERS_LIST_EVENTS: readonly SocketEvent[] = [
  socketEvents.orderStatusChanged,
];

/**
 * Мои предложения (компания). Статус предложения меняет клиент — своим
 * решением, — и об этом компании приходит `offer:status_changed`.
 *
 * `notification:created` здесь нужен: заказ могли удалить, и тогда никакого
 * события про предложение не будет вовсе (ТЗ §8), а строка из списка должна
 * исчезнуть.
 */
export const COMPANY_OFFERS_EVENTS: readonly SocketEvent[] = [
  socketEvents.offerStatusChanged,
  socketEvents.notificationCreated,
];

/**
 * Лента доступных заказов. Новый заказ приходит broadcast'ом в `company-feed`,
 * удалённый — уведомлением.
 *
 * Заказ, ушедший из ленты потому, что его взяла другая компания, события
 * не даёт: чужое движение заказа компании не показывают (ТЗ §4.1), и лента
 * догонит его при следующем открытии.
 */
export const COMPANY_FEED_EVENTS: readonly SocketEvent[] = [
  socketEvents.orderCreated,
  socketEvents.notificationCreated,
];

/**
 * Идентификатор заказа из нагрузки события.
 *
 * Нужен фильтр, а не доверие: в личную комнату пользователя приходят события
 * по **всем** его заказам, и открытая карточка одного заказа обязана
 * пропускать мимо события про соседний.
 *
 * `null` — у события нет заказа (`notification:created`) либо нагрузка
 * не той формы, что мы ждём.
 */
export function eventOrderId(payload: unknown): string | null {
  const value: unknown = (payload as { orderId?: unknown } | null)?.orderId;

  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Сколько ждать продолжения пачки, прежде чем перечитывать. */
export const BURST_DELAY_MS = 150;

/** Отложенный запуск, объединяющий пачку событий в один вызов. */
export interface Burst {
  /** Событие пришло: запустить через паузу, а если уже запланировано — подождать. */
  schedule: () => void;
  /** Уход со страницы: запланированное не выполнять. */
  cancel: () => void;
}

/**
 * Одно действие — один перечит.
 *
 * Таймер **не** продлевается каждым новым событием: иначе плотный поток
 * (например, компания грузит файлы один за другим) откладывал бы обновление
 * бесконечно. Первое событие назначает время, остальные до него — попутчики.
 */
export function createBurst(run: () => void, delay: number = BURST_DELAY_MS): Burst {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) return;

      timer = setTimeout(() => {
        timer = null;
        run();
      }, delay);
    },
    cancel() {
      if (timer === null) return;

      clearTimeout(timer);
      timer = null;
    },
  };
}
