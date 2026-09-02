/**
 * Клиент WebSocket-шлюза (ТЗ §8).
 *
 * Фаза 0 — только каркас: адрес, названия комнат и событий, единая точка
 * подключения. Реальное подключение появится в Фазе 5, когда на backend'е
 * будет `OrderGateway`; библиотека socket.io-client ставится там же, чтобы
 * не тащить в бандл код, который пока ничего не делает.
 */

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";
export const WS_NAMESPACE = "/ws";

/** Комнаты, на которые подписывается клиент. */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  order: (orderId: string) => `order:${orderId}`,
  companyFeed: () => "company-feed",
} as const;

/** События, которые эмитит backend при переходах state-машины (ТЗ §8). */
export const socketEvents = {
  orderCreated: "order:created",
  orderStatusChanged: "order:status_changed",
  offerCreated: "offer:created",
  offerUpdated: "offer:updated",
  offerStatusChanged: "offer:status_changed",
  orderFilesUpdated: "order:files_updated",
  orderAreaVerified: "order:area_verified",
  notificationCreated: "notification:created",
} as const;

export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];
