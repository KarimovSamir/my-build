import { describe, expect, it } from "vitest";

import { OfferStatus } from "@/lib/types";

import {
  companyOffersFilterKey,
  companyOffersHref,
  OFFER_STATUS_TABS,
  parseCompanyOffersFilter,
  type CompanyOffersFilter,
} from "./offers-filter";

/** Параметры адреса в том виде, в каком их отдаёт Next.js странице. */
function searchParams(href: string): Record<string, string | string[]> {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("parseCompanyOffersFilter", () => {
  it("читает известный статус", () => {
    expect(parseCompanyOffersFilter({ status: OfferStatus.SENT }).status).toBe(
      OfferStatus.SENT,
    );
  });

  it("неизвестный статус читает как «все предложения»", () => {
    // Статус заказа сюда попасть не должен: у списка предложений свой enum.
    expect(parseCompanyOffersFilter({ status: "IN_PROGRESS" }).status).toBeNull();
    expect(parseCompanyOffersFilter({}).status).toBeNull();
  });

  it("читает номер страницы", () => {
    expect(parseCompanyOffersFilter({ page: "2" }).page).toBe(2);
    expect(parseCompanyOffersFilter({ page: "0" }).page).toBe(1);
  });
});

describe("companyOffersHref", () => {
  it("без фильтра даёт чистый адрес раздела", () => {
    expect(companyOffersHref()).toBe("/offers");
    expect(companyOffersHref({ status: null, page: 1 })).toBe("/offers");
  });

  it("собранный адрес читается обратно тем же фильтром", () => {
    const filter: CompanyOffersFilter = { status: OfferStatus.WITHDRAWN, page: 3 };

    expect(parseCompanyOffersFilter(searchParams(companyOffersHref(filter)))).toEqual(filter);
  });
});

describe("OFFER_STATUS_TABS", () => {
  it("перечисляет все статусы предложения ровно по разу", () => {
    // Забытый статус означал бы вкладку, которой нет, — и предложения,
    // которые не найти ни на одной из них.
    expect([...OFFER_STATUS_TABS].sort()).toEqual(Object.values(OfferStatus).sort());
  });
});

describe("companyOffersFilterKey", () => {
  it("одинаковые фильтры дают один ключ, разные — разные", () => {
    const filter: CompanyOffersFilter = { status: OfferStatus.SENT, page: 1 };

    expect(companyOffersFilterKey(filter)).toBe(companyOffersFilterKey({ ...filter }));
    expect(companyOffersFilterKey({ ...filter, page: 2 })).not.toBe(
      companyOffersFilterKey(filter),
    );
    expect(companyOffersFilterKey({ ...filter, status: null })).not.toBe(
      companyOffersFilterKey(filter),
    );
  });
});
