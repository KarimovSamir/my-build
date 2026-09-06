"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { SocketEvent } from "@/lib/socket";
import { useCompanyFeed, useRealtimeRefresh } from "@/lib/use-realtime";

/**
 * Живое обновление списка (ТЗ §8).
 *
 * Ничего не рисует: списки собираются на сервере — фильтр, пагинация
 * и приватность считаются там, — поэтому обновление означает перечитать
 * страницу, а не пересобрать её данные в браузере.
 *
 * Ставится в серверную страницу как обычный компонент; состав событий берётся
 * из `lib/live-updates.ts`.
 */
export function LiveRefresh({
  events,
  /** Подписаться на ленту доступных заказов — только для `/available`. */
  feed = false,
}: {
  events: readonly SocketEvent[];
  feed?: boolean;
}) {
  const router = useRouter();

  useCompanyFeed(feed);
  useRealtimeRefresh(
    events,
    useCallback(() => router.refresh(), [router]),
  );

  return null;
}
