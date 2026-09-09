/**
 * Общие правила разбора и сборки адреса списка.
 *
 * Списков в кабинете шесть — заказы клиента, лента компании и её предложения,
 * уведомления, подрядчики и документы, — и все шесть держат выборку в адресе
 * страницы: так её можно переслать ссылкой, а кнопка «назад» возвращает
 * предыдущую выборку. Границы при этом не косметические:
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

/**
 * Идентификатор сущности в адресе: заказ у фильтра документов, например.
 *
 * Проверка не косметическая: backend принимает такие параметры через
 * `@IsUUID` и отвечает на мусор 400, а адрес правит пользователь. Без проверки
 * ссылка с опечаткой превращала бы раздел в экран ошибки вместо списка.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUuidParam(value: string | string[] | undefined): string | null {
  const parsed = firstParam(value);

  return parsed && UUID_PATTERN.test(parsed) ? parsed : null;
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
 * Куда ведёт «Назад» в подвале списка.
 *
 * Со страницы за пределами выборки — на последнюю, где записи есть, а не на
 * соседнюю пустую: адрес `?page=999` набирается руками и приезжает ссылкой,
 * и листание назад по одной пустой странице до данных не доводит.
 */
export function previousPage(page: number, totalPages: number): number {
  return page > totalPages ? Math.max(totalPages, 1) : page - 1;
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
