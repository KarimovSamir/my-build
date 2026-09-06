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

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socket = browserSocket();

  useEffect(() => {
    if (!socket) return;

    /**
     * Отказ авторизации — не повод молчать, но и не повод падать: страницы
     * работают и без сокета. socket.io сам не переподключается после ошибки
     * middleware, и это правильно: токен от этого годным не станет, а кабинет
     * без сессии всё равно уведёт на вход.
     */
    const warn = (error: Error) => console.warn(`WebSocket: ${error.message}`);

    socket.on("connect_error", warn);
    socket.connect();

    return () => {
      socket.off("connect_error", warn);
      socket.disconnect();
    };
  }, [socket]);

  return <SocketContext value={socket}>{children}</SocketContext>;
}
