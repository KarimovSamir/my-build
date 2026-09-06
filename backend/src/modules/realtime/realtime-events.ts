/**
 * Из результата действия — список сообщений WebSocket (ТЗ §8).
 *
 * Здесь нет ни socket.io, ни Nest: чистые функции над уже полученным
 * результатом транзакции. Причина та же, что у `order-view`, — адресация
 * событий это вопрос приватности (кому что уходит), и проверяться она должна
 * unit-тестами целиком, без поднятия сервера и сокетов.
 *
 * Полезная нагрузка событий про заказ — только идентификаторы: одна и та же
 * рассылка уходит всей комнате, а видимый состав заказа у клиента и у компании
 * разный (ТЗ §4.1). Подробности объяснены в `shared/src/realtime.ts`.
 *
 * Отсюда же правило адресации: в комнату заказа уходит только то, что видят
 * все её участники, — движение самого заказа, файлы сдач и уточнённая площадь.
 * Всё, что относится к конкретному предложению, адресуется поимённо: клиенту
 * заказа и компании-автору. Иначе компания узнавала бы о конкурентах, которых
 * ей не показывают ни `order-view`, ни лента.
 */

import {
  isActiveOffer,
  socketEvents,
  socketRooms,
  type OfferEventPayload,
  type OrderEventPayload,
  type NotificationEventPayload,
  type SocketEvent,
} from '@mybuild/shared';

import {
  toNotificationDto,
  type NotificationRow,
} from '../notifications/notification-view.js';
import type { AppliedTransition } from '../orders/order-transition.service.js';

/**
 * Уведомление вместе с адресатом. `NotificationRow` описывает то, что уходит
 * в ответ API, а кому его отправить, там не нужно — здесь нужно.
 */
export interface NotificationTarget extends NotificationRow {
  userId: string;
}

/** Одна рассылка: событие с нагрузкой в один или несколько комнат. */
export interface RealtimeMessage {
  rooms: string[];
  event: SocketEvent;
  payload: OrderEventPayload | OfferEventPayload | NotificationEventPayload;
}

/**
 * Кого выставить из комнаты заказа.
 *
 * Компания состоит в комнате, пока её предложение активно. Как только оно
 * отозвано, отклонено или проиграло выбор, заказ для неё снова выглядит как
 * `WAITING` (ТЗ §4.1) — и оставь мы её в комнате, следующее
 * `order:status_changed` рассказало бы ей о настоящем движении заказа.
 */
export interface RoomEviction {
  userRoom: string;
  orderRoom: string;
}

/**
 * Что разослать после перехода. Выселения применяются **до** сообщений:
 * иначе проигравшая компания успела бы получить `order:status_changed`
 * с уходом заказа в работу.
 */
export interface RealtimeBroadcast {
  evictions: RoomEviction[];
  messages: RealtimeMessage[];
}

/** Новый заказ — в ленту компаний (ТЗ §8). Записей в БД событие не создаёт. */
export function orderCreatedBroadcast(orderId: string): RealtimeBroadcast {
  return {
    evictions: [],
    messages: [
      {
        rooms: [socketRooms.companyFeed()],
        event: socketEvents.orderCreated,
        payload: { orderId },
      },
    ],
  };
}

/** Что рассылать после перехода состояния заказа. */
export interface TransitionBroadcastOptions {
  /**
   * Событие про само предложение, если действие его создало или изменило.
   * Отдельно от статусов: `offer:created` и `offer:updated` различает только
   * вызывающий код — по тому, была ли строка предложения до запроса.
   */
  offerEvent?: typeof socketEvents.offerCreated | typeof socketEvents.offerUpdated;
}

export function transitionBroadcast(
  applied: AppliedTransition,
  options: TransitionBroadcastOptions = {},
): RealtimeBroadcast {
  const orderId = applied.order.id;
  const orderRoom = socketRooms.order(orderId);
  const clientRoom = socketRooms.user(applied.order.clientId);

  const messages: RealtimeMessage[] = [];

  // Про предложение знают двое: клиент заказа и та компания, чьё оно (ТЗ §4.1).
  // В комнату заказа это не уходит: там сидят все компании с активным
  // предложением, и `offer:created` рассказал бы каждой о появлении конкурента,
  // а `offer:status_changed` при выборе исполнителя — победителю о том, сколько
  // предложений проиграло и какие у них идентификаторы.
  if (options.offerEvent) {
    messages.push({
      rooms: [clientRoom, socketRooms.user(applied.companyId)],
      event: options.offerEvent,
      payload: { orderId, offerId: applied.offerId },
    });
  }

  // Отправка второго предложения оставляет заказ в `AWAITING_CONFIRMATION`
  // (ТЗ §4.1): перехода не было, и события о смене статуса тоже нет —
  // о самом предложении уже сказало `offer:created`.
  if (applied.fromStatus !== applied.nextStatus) {
    messages.push({
      rooms: [orderRoom, clientRoom],
      event: socketEvents.orderStatusChanged,
      payload: { orderId },
    });
  }

  for (const update of applied.offerUpdates) {
    messages.push({
      rooms: [clientRoom, socketRooms.user(update.companyId)],
      event: socketEvents.offerStatusChanged,
      payload: { orderId, offerId: update.offerId },
    });
  }

  messages.push(...notificationMessages(applied.notifications));

  const evictions = applied.offerUpdates
    .filter((update) => !isActiveOffer(update.status))
    .map((update) => ({ userRoom: socketRooms.user(update.companyId), orderRoom }));

  return { evictions, messages };
}

/**
 * События, которые статус заказа не меняют: файлы сдачи и уточнение площади
 * (ТЗ §8). Адресат тот же, что у перехода, — комната заказа и клиент.
 */
export function orderUpdateBroadcast(
  event: typeof socketEvents.orderFilesUpdated | typeof socketEvents.orderAreaVerified,
  order: { id: string; clientId: string },
  notifications: NotificationTarget[],
): RealtimeBroadcast {
  return {
    evictions: [],
    messages: [
      {
        rooms: [socketRooms.order(order.id), socketRooms.user(order.clientId)],
        event,
        payload: { orderId: order.id },
      },
      ...notificationMessages(notifications),
    ],
  };
}

/**
 * Только уведомления, без событий про заказ: так уходит `ORDER_DELETED` —
 * заказа больше нет, и комнаты у него тоже.
 */
export function notificationsBroadcast(
  notifications: NotificationTarget[],
): RealtimeBroadcast {
  return { evictions: [], messages: notificationMessages(notifications) };
}

/**
 * `notification:created` на каждую созданную запись (ТЗ §8).
 *
 * Единственное событие, которое несёт данные: адресат один, скрывать от него
 * нечего, а колокольчику нужен готовый текст, а не повод сходить за ним.
 */
function notificationMessages(notifications: NotificationTarget[]): RealtimeMessage[] {
  return notifications.map((notification) => ({
    rooms: [socketRooms.user(notification.userId)],
    event: socketEvents.notificationCreated,
    payload: { notification: toNotificationDto(notification) },
  }));
}
