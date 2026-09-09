/**
 * Фильтр раздела «Документы» (`/documents`, ТЗ §5, §7).
 *
 * Фильтров два — чей файл и по какому заказу, — и оба живут в адресе страницы,
 * как во всех остальных списках кабинета: ссылку на «файлы исполнителя по
 * ORD-24» можно переслать, а «назад» возвращает прежнюю выборку.
 *
 * Поиска по имени файла здесь нет: `GET /documents` его не принимает (ТЗ §5),
 * а фильтровать страницу выдачи на фронте — значит искать в двадцати строках
 * из ста.
 */

import { FileOwnerType } from "@/lib/types";

import {
  listHref,
  readEnumParam,
  readPageParam,
  readUuidParam,
  type SearchParams,
} from "./list-params";

export interface DocumentsFilter {
  /** Чей файл: задание клиента или сдача исполнителя. `null` — все. */
  ownerType: FileOwnerType | null;
  /** Заказ, к которому относится файл. `null` — все заказы. */
  orderId: string | null;
  page: number;
}

/** Порядок вкладок: сначала задание клиента, потом работа исполнителя. */
export const DOCUMENT_OWNER_TABS: readonly FileOwnerType[] = [
  FileOwnerType.CLIENT,
  FileOwnerType.COMPANY,
];

const OWNER_TYPES: ReadonlySet<string> = new Set(Object.values(FileOwnerType));

export function parseDocumentsFilter(params: SearchParams): DocumentsFilter {
  return {
    ownerType: readEnumParam<FileOwnerType>(params.ownerType, OWNER_TYPES),
    // Непонятный идентификатор читается как «фильтра нет»: backend отвечает
    // на такой параметр 400, и правленый руками адрес показал бы ошибку
    // вместо списка.
    orderId: readUuidParam(params.orderId),
    page: readPageParam(params.page),
  };
}

export function documentsHref({
  ownerType = null,
  orderId = null,
  page = 1,
}: Partial<DocumentsFilter> = {}): string {
  return listHref("/documents", {
    ownerType,
    orderId,
    page: page > 1 ? page : undefined,
  });
}

/** Фильтров нет — список пуст потому, что файлов нет, а не «не нашлось». */
export function isEmptyDocumentsFilter(filter: DocumentsFilter): boolean {
  return filter.ownerType === null && filter.orderId === null;
}

/** Ключ выборки для `<Suspense>`: при смене фильтра нужен новый скелет. */
export function documentsFilterKey(filter: DocumentsFilter): string {
  return `${filter.ownerType ?? "all"}|${filter.orderId ?? "all"}|${filter.page}`;
}
