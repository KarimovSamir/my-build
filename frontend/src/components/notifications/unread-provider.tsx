"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { UnreadCount } from "@/lib/types";

import { browserApi } from "@/lib/api.client";
import { NOTIFICATIONS_EVENTS } from "@/lib/live-updates";
import { useRealtimeRefresh } from "@/lib/use-realtime";

/**
 * Счётчик непрочитанных — один на весь кабинет (ТЗ §7, §8).
 *
 * Живёт в каркасе `(app)` по двум причинам:
 *
 * - **Колокольчик стоит в шапке, а помечают прочитанным в разделе.** Это разные
 *   ветки дерева, и без общего состояния счётчик расходился бы с списком до
 *   ближайшей перезагрузки страницы.
 * - **Счётчик обязан меняться сам.** `notification:created` приходит в личную
 *   комнату пользователя на любом экране — не только там, где открыт список.
 *
 * Число приходит с сервера (`GET /notifications/unread-count`) и им же
 * перепроверяется после каждого события: считать «плюс один» на событие
 * нельзя — то же уведомление могли прочитать в соседней вкладке.
 */

export interface Unread {
  count: number;
  /** Сходить за настоящим числом. Зовётся после отметок о прочтении. */
  refresh: () => void;
}

const UnreadContext = createContext<Unread | null>(null);

export function UnreadProvider({
  count: fromServer,
  children,
}: {
  /** Счётчик на момент серверного рендера. */
  count: number;
  children: ReactNode;
}) {
  // Серверный рендер — источник правды при входе и после `router.refresh()`.
  // Сверка в рендере, а не в эффекте: тот же приём, что в карточке заказа,
  // иначе между двумя рендерами мелькнёт устаревшее число.
  const [state, setState] = useState({ count: fromServer, server: fromServer });

  if (state.server !== fromServer) {
    setState({ count: fromServer, server: fromServer });
  }

  const refresh = useCallback(() => {
    void browserApi.get<UnreadCount>("/notifications/unread-count").then(
      ({ count }) => setState((current) => ({ ...current, count })),
      () => {
        // Счётчик — украшение шапки. Сорвавшийся запрос оставляет прежнее
        // число и молчит: тост об этом сказал бы пользователю о проблеме,
        // которой у него нет.
      },
    );
  }, []);

  useRealtimeRefresh(NOTIFICATIONS_EVENTS, refresh);

  const value = useMemo<Unread>(
    () => ({ count: state.count, refresh }),
    [state.count, refresh],
  );

  return <UnreadContext value={value}>{children}</UnreadContext>;
}

/**
 * Счётчик непрочитанных.
 *
 * Запасного варианта у хука нет намеренно: все, кому он нужен, стоят внутри
 * каркаса кабинета. Молчаливый ноль вместо ошибки означал бы колокольчик без
 * значка и вечно недоступную кнопку «Прочитать все» — поломку, которую никто
 * не заметит.
 */
export function useUnread(): Unread {
  const unread = useContext(UnreadContext);

  if (!unread) {
    throw new Error("useUnread вызван вне UnreadProvider");
  }

  return unread;
}
