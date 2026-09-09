/**
 * Фильтр каталога подрядчиков (`/contractors`, ТЗ §5, §7).
 *
 * Разбирать здесь нечего, кроме поиска и страницы: вкладок у каталога нет —
 * компании ничем не различаются, кроме названия и города, а по ним и ищут.
 */

import {
  listHref,
  readPageParam,
  readQueryParam,
  type SearchParams,
} from "./list-params";

export interface ContractorsFilter {
  q: string;
  page: number;
}

export function parseContractorsFilter(params: SearchParams): ContractorsFilter {
  return {
    q: readQueryParam(params.q),
    page: readPageParam(params.page),
  };
}

export function contractorsHref({
  q = "",
  page = 1,
}: Partial<ContractorsFilter> = {}): string {
  return listHref("/contractors", { q, page: page > 1 ? page : undefined });
}

/** Поиска нет — каталог пуст потому, что компаний нет, а не «не нашлось». */
export function isEmptyContractorsFilter(filter: ContractorsFilter): boolean {
  return filter.q === "";
}

/** Ключ выборки для `<Suspense>`: при смене запроса нужен новый скелет. */
export function contractorsFilterKey(filter: ContractorsFilter): string {
  return `${filter.q}|${filter.page}`;
}
