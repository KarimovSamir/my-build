/**
 * Клиент WebSocket-шлюза (ТЗ §8).
 *
 * Имена namespace, комнат и событий живут в `shared/` — их знает и шлюз
 * на backend'е, и этот модуль; двух копий быть не должно (ТЗ §12.7).
 * Здесь остаётся только то, что относится к браузеру: адрес сервера.
 *
 * Само подключение (socket.io-client, переподключение, отписка при уходе
 * со страницы) появится в подфазе 5.3 — библиотека ставится там же, чтобы
 * не тащить в бандл код, который пока ничего не делает.
 */

export {
  WS_NAMESPACE,
  socketEvents,
  socketMessages,
  socketRooms,
  type SocketEvent,
  type SocketMessage,
} from "@/lib/types";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";
