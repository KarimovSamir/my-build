/**
 * Клиент WebSocket-шлюза (ТЗ §8).
 *
 * Имена namespace, комнат и событий живут в `shared/` — их знает и шлюз
 * на backend'е, и этот модуль; двух копий быть не должно (ТЗ §12.7). Здесь
 * остаётся только то, что относится к браузеру: адрес сервера и сборка
 * подключения.
 *
 * React тут нет намеренно: подключение — это объект socket.io, а не состояние
 * компонента. Кто им владеет и когда закрывает, решает `RealtimeProvider`.
 */

import { io, type Socket } from "socket.io-client";

import { getAccessToken } from "@/lib/api.client";
import { WS_NAMESPACE } from "@/lib/types";

export {
  WS_NAMESPACE,
  socketEvents,
  socketMessages,
  socketRooms,
  type SocketEvent,
  type SocketMessage,
  type SubscribeAck,
} from "@/lib/types";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

/** Откуда брать access-токен Supabase. Асинхронно: SDK может его обновлять. */
export type TokenProvider = () => Promise<string | null>;

/**
 * Подключение к шлюзу. Не подключается само — `autoConnect: false`: сокет
 * создаётся в эффекте, а эффект в React выполняется дважды в dev-режиме.
 *
 * Токен отдаётся функцией, а не значением: socket.io зовёт `auth` перед
 * **каждой** попыткой подключения, в том числе при переподключении после
 * обрыва. Значит, проснувшаяся через час вкладка уйдёт на сервер с уже
 * обновлённым токеном, а не с протухшим, который был при создании сокета.
 */
export function createAppSocket(getToken: TokenProvider): Socket {
  const url = `${WS_URL.replace(/\/$/, "")}${WS_NAMESPACE}`;

  return io(url, {
    autoConnect: false,
    auth: (send: (data: { token: string }) => void) => {
      void getToken().then(
        (token) => send({ token: token ?? "" }),
        // Сессии нет — пусть отказывает сервер: другого места для этого решения
        // быть не должно, иначе правила разойдутся с REST.
        () => send({ token: "" }),
      );
    },
  });
}

/**
 * Сокет вкладки. Один на всё приложение и только в браузере.
 *
 * Синглтон, а не состояние React: подключение переживает и перерисовки,
 * и повторный проход эффектов в dev-режиме, а рукопожатие с проверкой JWKS
 * стоит достаточно, чтобы не делать его дважды. На сервере подключаться
 * некуда — там `null`, и это нормальное значение для всех, кто его читает.
 */
let shared: Socket | null = null;

export function browserSocket(): Socket | null {
  if (typeof window === "undefined") return null;

  shared ??= createAppSocket(getAccessToken);

  return shared;
}

export type { Socket };
