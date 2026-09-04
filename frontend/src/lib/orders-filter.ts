/**
 * Фильтр списка заказов клиента: статус, поисковая строка, страница (ТЗ §4.1).
 *
 * Состояние фильтра живёт в адресе страницы, а не в React-состоянии: так его
 * можно переслать ссылкой, а кнопка «назад» возвращает предыдущую выборку.
 * Разбор и сборка адреса собраны здесь, чтобы страница, поиск и вкладки
 * понимали параметры одинаково; общие для всех списков границы — в
 * `list-params.ts`.
 */

import { OrderStatus } from "@/lib/types";

import {
  listHref,
  readEnumParam,
  readPageParam,
  readQueryParam,
  type SearchParams,
} from "./list-params";

export interface OrdersFilter {
  /** null — вкладка «Все заказы». */
  status: OrderStatus | null;
  q: string;
  page: number;
}

/** Порядок вкладок — жизненный путь заказа, а не алфавит (ТЗ §4). */
export const ORDER_STATUS_TABS: OrderStatus[] = [
  OrderStatus.WAITING,
  OrderStatus.AWAITING_CONFIRMATION,
  OrderStatus.IN_PROGRESS,
  OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
  OrderStatus.COMPLETION_DISPUTED,
  OrderStatus.COMPLETED,
];

const knownStatuses = new Set<string>(Object.values(OrderStatus));

/**
 * Разбор параметров адреса. Всё непонятное молча заменяется значением по
 * умолчанию: адрес правит пользователь, и ошибаться на этом странице нельзя.
 */
export function parseOrdersFilter(params: SearchParams): OrdersFilter {
  return {
    status: readEnumParam<OrderStatus>(params.status, knownStatuses),
    q: readQueryParam(params.q),
    page: readPageParam(params.page),
  };
}

/** Адрес списка с заданным фильтром. Значения по умолчанию в адрес не пишем. */
export function ordersHref({ status = null, q = "", page = 1 }: Partial<OrdersFilter> = {}): string {
  return listHref("/orders", { status, q, page: page > 1 ? page : undefined });
}

/** Фильтр не задан — список пуст потому, что заказов нет, а не потому, что не нашлось. */
export function isEmptyFilter(filter: OrdersFilter): boolean {
  return filter.status === null && filter.q === "";
}

/**
 * Ключ выборки. Им помечается `<Suspense>` вокруг таблицы: при смене фильтра
 * граница обязана показать скелет заново, а не оставить прежние строки.
 */
export function ordersFilterKey(filter: OrdersFilter): string {
  return `${filter.status ?? ""}|${filter.q}|${filter.page}`;
}
