/**
 * Фильтр списка заказов: статус, поисковая строка, страница (ТЗ §4.1).
 *
 * Состояние фильтра живёт в адресе страницы, а не в React-состоянии: так его
 * можно переслать ссылкой, а кнопка «назад» возвращает предыдущую выборку.
 * Разбор и сборка адреса собраны здесь, чтобы страница, поиск и вкладки
 * понимали параметры одинаково.
 */

import { OrderStatus } from "@mybuild/shared";

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

/** Столько же, сколько принимает backend (`MaxLength(200)`), иначе получим 400. */
const MAX_QUERY_LENGTH = 200;

const knownStatuses = new Set<string>(Object.values(OrderStatus));

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Разбор параметров адреса. Всё непонятное молча заменяется значением по
 * умолчанию: адрес правит пользователь, и ошибаться на этом странице нельзя.
 */
export function parseOrdersFilter(params: SearchParams): OrdersFilter {
  return {
    status: readStatus(params.status),
    q: readQuery(params.q),
    page: readPage(params.page),
  };
}

/** Адрес списка с заданным фильтром. Значения по умолчанию в адрес не пишем. */
export function ordersHref({ status = null, q = "", page = 1 }: Partial<OrdersFilter> = {}): string {
  const params = new URLSearchParams();

  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));

  const search = params.toString();

  return search ? `/orders?${search}` : "/orders";
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

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readStatus(value: string | string[] | undefined): OrderStatus | null {
  const status = first(value);

  return status && knownStatuses.has(status) ? (status as OrderStatus) : null;
}

function readQuery(value: string | string[] | undefined): string {
  return (first(value) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

function readPage(value: string | string[] | undefined): number {
  const page = Number(first(value));

  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
