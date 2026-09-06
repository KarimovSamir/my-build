/**
 * Фильтр раздела «Уведомления» (`/notifications`, ТЗ §5, §7).
 *
 * Выборка та же, что у остальных списков кабинета, и живёт там же — в адресе
 * страницы: вкладка «Непрочитанные» пересылается ссылкой, а «назад» возвращает
 * прежний список.
 */

import { firstParam, listHref, readPageParam, type SearchParams } from "./list-params";

export interface NotificationsFilter {
  /** Вкладка «Непрочитанные». `false` — показываем всё. */
  unread: boolean;
  page: number;
}

/**
 * `unread` читается только как `true`: отсутствие фильтра выражается
 * отсутствием параметра, а не значением `false`. Backend понимает и «только
 * прочитанные» (`unread=false`), но вкладки для них нет — прочитанное само
 * по себе список ни о чём.
 */
export function parseNotificationsFilter(params: SearchParams): NotificationsFilter {
  return {
    unread: firstParam(params.unread) === "true",
    page: readPageParam(params.page),
  };
}

export function notificationsHref({
  unread = false,
  page = 1,
}: Partial<NotificationsFilter> = {}): string {
  return listHref("/notifications", {
    unread: unread ? "true" : undefined,
    page: page > 1 ? page : undefined,
  });
}

/** Ключ выборки для `<Suspense>`: при смене вкладки нужен новый скелет. */
export function notificationsFilterKey(filter: NotificationsFilter): string {
  return `${filter.unread ? "unread" : "all"}|${filter.page}`;
}
