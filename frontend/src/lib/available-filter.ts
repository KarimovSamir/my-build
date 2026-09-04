/**
 * Фильтр ленты доступных заказов (`/available`, ТЗ §4.1).
 *
 * Вкладок по статусу здесь нет и быть не может: в ленту попадают только заказы,
 * которые ещё ищут исполнителя, а прогресса чужого заказа компания не видит
 * вовсе — для неё он всегда выглядит как `WAITING`. Остаются поиск и страница.
 */

import {
  listHref,
  readPageParam,
  readQueryParam,
  type SearchParams,
} from "./list-params";

export interface AvailableFilter {
  q: string;
  page: number;
}

export function parseAvailableFilter(params: SearchParams): AvailableFilter {
  return {
    q: readQueryParam(params.q),
    page: readPageParam(params.page),
  };
}

export function availableHref({ q = "", page = 1 }: Partial<AvailableFilter> = {}): string {
  return listHref("/available", { q, page: page > 1 ? page : undefined });
}

/** Поиска нет — лента пуста потому, что свободных заказов нет, а не «не нашлось». */
export function isEmptyAvailableFilter(filter: AvailableFilter): boolean {
  return filter.q === "";
}

/** Ключ выборки для `<Suspense>`: при смене фильтра нужен новый скелет. */
export function availableFilterKey(filter: AvailableFilter): string {
  return `${filter.q}|${filter.page}`;
}
