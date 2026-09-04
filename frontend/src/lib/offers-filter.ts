/**
 * Фильтр списка «Мои предложения» компании (`/offers`, ТЗ §5).
 *
 * Поиска здесь нет — как и на backend: список разбирается вкладками статусов.
 */

import { OfferStatus } from "@/lib/types";

import {
  listHref,
  readEnumParam,
  readPageParam,
  type SearchParams,
} from "./list-params";

export interface CompanyOffersFilter {
  /** null — вкладка «Все предложения». */
  status: OfferStatus | null;
  page: number;
}

/**
 * Порядок вкладок — жизненный путь предложения: сначала то, что ещё в игре,
 * потом завершённое, потом выбывшее.
 */
export const OFFER_STATUS_TABS: OfferStatus[] = [
  OfferStatus.SENT,
  OfferStatus.ACCEPTED,
  OfferStatus.WORK_SUBMITTED,
  OfferStatus.BACK_FOR_OVERRIDE,
  OfferStatus.COMPLETED,
  OfferStatus.REJECTED,
  OfferStatus.NOT_ACCEPTED,
  OfferStatus.WITHDRAWN,
];

const knownStatuses = new Set<string>(Object.values(OfferStatus));

export function parseCompanyOffersFilter(params: SearchParams): CompanyOffersFilter {
  return {
    status: readEnumParam<OfferStatus>(params.status, knownStatuses),
    page: readPageParam(params.page),
  };
}

export function companyOffersHref({
  status = null,
  page = 1,
}: Partial<CompanyOffersFilter> = {}): string {
  return listHref("/offers", { status, page: page > 1 ? page : undefined });
}

/** Ключ выборки для `<Suspense>`: при смене вкладки нужен новый скелет. */
export function companyOffersFilterKey(filter: CompanyOffersFilter): string {
  return `${filter.status ?? ""}|${filter.page}`;
}
