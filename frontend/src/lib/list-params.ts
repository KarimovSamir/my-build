/**
 * Общие правила разбора и сборки адреса списка.
 *
 * Списков в кабинете три — заказы клиента, лента компании и её предложения, —
 * и все три держат выборку в адресе страницы: так её можно переслать ссылкой,
 * а кнопка «назад» возвращает предыдущую. Границы при этом не косметические:
 * страница за потолком backend и запрос длиннее допустимого возвращаются
 * ответом 400, а не пустым списком. Повтори эти правила каждый список
 * по-своему — рано или поздно один из них их потеряет.
 *
 * Модуль чистый: ни React, ни fetch. Работает и на сервере, и в браузере.
 */

import { MAX_PAGE } from "@/lib/types";

/** Параметры адреса в том виде, в каком их отдаёт Next.js странице. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Столько же, сколько принимает backend (`MaxLength(200)`), иначе получим 400. */
export const MAX_QUERY_LENGTH = 200;

/** Из повторяющегося параметра берём первое значение. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Значение из известного набора — статус заказа или предложения.
 * Всё непонятное читается как «фильтра нет»: адрес правит пользователь,
 * и падать на этом страница не должна.
 */
export function readEnumParam<T extends string>(
  value: string | string[] | undefined,
  known: ReadonlySet<string>,
): T | null {
  const parsed = firstParam(value);

  return parsed && known.has(parsed) ? (parsed as T) : null;
}

export function readQueryParam(value: string | string[] | undefined): string {
  return (firstParam(value) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

export function readPageParam(value: string | string[] | undefined): number {
  const page = Number(firstParam(value));

  // Потолок тот же, что у backend (`MAX_PAGE`): страница за его пределами
  // вернулась бы ответом 400, а не пустым списком.
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1;
}

/**
 * Адрес раздела с заданными параметрами. Пустые значения в адрес не пишутся —
 * значение по умолчанию в строке запроса только мешает читать ссылку.
 */
export function listHref(
  base: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();

  return query ? `${base}?${query}` : base;
}
