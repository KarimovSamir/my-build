"use client";

import { createContext, useEffect, type ReactNode } from "react";

import { browserSocket, type Socket } from "@/lib/socket";

/**
 * Одно подключение к шлюзу на весь кабинет (ТЗ §8).
 *
 * Провайдер живёт в каркасе `(app)`, поэтому сокет переживает переходы между
 * страницами: подписка на комнаты меняется, само соединение — нет. Открывать
 * его на каждой странице значило бы рукопожатие с проверкой JWKS при каждом
 * клике по меню.
 *
 * При серверном рендере в контексте лежит `null` — экраны от этого не зависят:
 * данные они получают из REST, а real-time только освежает их.
 */
export const SocketContext = createContext<Socket | null>(null);

/**
 * Паузы перед повторной попыткой подключиться после отказа рукопожатия.
 *
 * socket.io после `connect_error` сам не повторяет — и это правильно для
 * настоящего отказа в правах. Но тем же отказом выглядит и временная беда:
 * недоступный JWKS Supabase на стороне backend превращается в «Токен
 * недействителен или истёк». Без повторов минутный сбой оставлял бы вкладку
 * без real-time до перезагрузки страницы.
 *
 * Повторов немного и они редеют: если дело в самой сессии, попытки кончатся
 * меньше чем за минуту, а кабинет без сессии всё равно уведёт на вход.
 */
const RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 10_000, 30_000];

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socket = browserSocket();

  useEffect(() => {
    if (!socket) return;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (timer === null) return;

      clearTimeout(timer);
      timer = null;
    };

    /** Подключились — значит прошлые неудачи больше ни о чём не говорят. */
    const onConnect = () => {
      attempt = 0;
      clearRetry();
    };

    const onError = (error: Error) => {
      console.warn(`WebSocket: ${error.message}`);

      const delay = RETRY_DELAYS_MS[attempt];

      // Попытки кончились: дело не во временном сбое.
      if (delay === undefined) return;

      attempt += 1;
      clearRetry();

      timer = setTimeout(() => {
        timer = null;
        // Токен спрашивается заново перед каждой попыткой (`lib/socket.ts`),
        // так что обновлённая сессия подхватится сама.
        socket.connect();
      }, delay);
    };

    /**
     * Сервер закрывает сокет сам, когда истекает срок токена (ТЗ §6). После
     * такого разрыва socket.io не переподключается, хотя причина уже прошла:
     * Supabase к этому моменту обновил сессию, и функция `auth` в `lib/socket`
     * возьмёт свежий токен на новой попытке.
     */
    const reconnect = (reason: string) => {
      if (reason === "io server disconnect") socket.connect();
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onError);
    socket.on("disconnect", reconnect);
    socket.connect();

    return () => {
      clearRetry();
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      socket.off("disconnect", reconnect);
      socket.disconnect();
    };
  }, [socket]);

  return <SocketContext value={socket}>{children}</SocketContext>;
}
