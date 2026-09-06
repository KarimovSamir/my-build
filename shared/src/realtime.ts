/**
 * Контракт WebSocket-шлюза (ТЗ §8) — то, что обязаны знать обе стороны.
 *
 * Здесь только имена: namespace, комнаты, события сервера, сообщения клиента
 * и формы полезной нагрузки. Сам шлюз живёт на backend, клиент — во фронте,
 * а разойдись у них названия событий — real-time просто перестанет работать,
 * причём молча: подписка на несуществующее событие ошибки не даёт.
 *
 * Модуль чистый: ни socket.io, ни Nest, ни React.
 */

import type { NotificationDto } from './types.js';

/** Namespace шлюза (ТЗ §8). */
export const WS_NAMESPACE = '/ws';

/** Комнаты, в которые шлюз рассылает события (ТЗ §8). */
export const socketRooms = {
  /** Личные уведомления пользователя. */
  user: (userId: string) => `user:${userId}`,
  /** Участники конкретного заказа. */
  order: (orderId: string) => `order:${orderId}`,
  /** Компании, подписанные на ленту доступных заказов. */
  companyFeed: () => 'company-feed',
} as const;

/** События, которые эмитит backend (ТЗ §8). */
export const socketEvents = {
  orderCreated: 'order:created',
  orderStatusChanged: 'order:status_changed',
  offerCreated: 'offer:created',
  offerUpdated: 'offer:updated',
  offerStatusChanged: 'offer:status_changed',
  orderFilesUpdated: 'order:files_updated',
  orderAreaVerified: 'order:area_verified',
  notificationCreated: 'notification:created',
} as const;

export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];

/** Сообщения, которые шлёт клиент: подписка на комнаты. */
export const socketMessages = {
  subscribeOrder: 'subscribe:order',
  unsubscribeOrder: 'unsubscribe:order',
  subscribeFeed: 'subscribe:feed',
  unsubscribeFeed: 'unsubscribe:feed',
} as const;

export type SocketMessage = (typeof socketMessages)[keyof typeof socketMessages];

/**
 * Полезная нагрузка событий про заказ.
 *
 * Только идентификатор — данных в событии нет намеренно. Событие уходит
 * в комнату целиком, а что именно в заказе позволено видеть смотрящему,
 * зависит от смотрящего (ТЗ §4.1): статус, цена и подрядчик у клиента и
 * у компании разные. Разослать одну нагрузку всей комнате и не нарушить
 * приватность нельзя, поэтому событие — это сигнал «перечитай заказ»,
 * а данные по-прежнему приходят из REST, где приватность уже посчитана.
 */
export interface OrderEventPayload {
  orderId: string;
}

/** То же для событий про предложение: чьё оно и почём — не рассылается. */
export interface OfferEventPayload {
  orderId: string;
  offerId: string;
}

/**
 * `notification:created` — единственное событие с данными: оно уходит
 * в комнату одного пользователя, то есть скрывать в нём нечего, а колокольчику
 * (подфаза 5.4) нужен готовый текст, а не повод сходить за ним ещё раз.
 */
export interface NotificationEventPayload {
  notification: NotificationDto;
}

/** Тело сообщений `subscribe:order` / `unsubscribe:order`. */
export interface SubscribeOrderPayload {
  orderId: string;
}

/**
 * Ответ шлюза на подписку. Отказ — не ошибка соединения: сокет остаётся жив,
 * просто в комнату заказа его не пустили.
 */
export interface SubscribeAck {
  ok: boolean;
  /** Почему отказано. Есть только при `ok: false`. */
  error?: string;
}
