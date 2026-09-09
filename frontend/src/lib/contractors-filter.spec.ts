import { describe, expect, it } from "vitest";

import { MAX_PAGE } from "@/lib/types";

import {
  contractorsFilterKey,
  contractorsHref,
  isEmptyContractorsFilter,
  parseContractorsFilter,
  type ContractorsFilter,
} from "./contractors-filter";

/** Параметры адреса в том виде, в каком их отдаёт Next.js странице. */
function searchParams(href: string): Record<string, string | string[]> {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("parseContractorsFilter", () => {
  it("читает поиск и страницу", () => {
    expect(parseContractorsFilter({ q: "  СтройГрад ", page: "2" })).toEqual({
      q: "СтройГрад",
      page: 2,
    });
  });

  it("пустые параметры дают первую страницу без поиска", () => {
    expect(parseContractorsFilter({})).toEqual({ q: "", page: 1 });
  });

  it("страница за потолком backend читается как первая, а не уходит в 400", () => {
    expect(parseContractorsFilter({ page: String(MAX_PAGE + 1) }).page).toBe(1);
  });
});

describe("contractorsHref", () => {
  it("без фильтра даёт чистый адрес раздела", () => {
    expect(contractorsHref()).toBe("/contractors");
    expect(contractorsHref({ q: "", page: 1 })).toBe("/contractors");
  });

  it("собранный адрес читается обратно тем же фильтром", () => {
    const filter: ContractorsFilter = { q: "Москва", page: 3 };

    expect(parseContractorsFilter(searchParams(contractorsHref(filter)))).toEqual(filter);
  });
});

describe("isEmptyContractorsFilter", () => {
  it("пустым считается фильтр без поиска: страница выборкой не является", () => {
    expect(isEmptyContractorsFilter({ q: "", page: 4 })).toBe(true);
    expect(isEmptyContractorsFilter({ q: "ремонт", page: 1 })).toBe(false);
  });
});

describe("contractorsFilterKey", () => {
  it("одинаковые фильтры дают один ключ, разные — разные", () => {
    const filter: ContractorsFilter = { q: "Москва", page: 1 };

    expect(contractorsFilterKey(filter)).toBe(contractorsFilterKey({ ...filter }));
    expect(contractorsFilterKey({ ...filter, page: 2 })).not.toBe(
      contractorsFilterKey(filter),
    );
    expect(contractorsFilterKey({ ...filter, q: "Казань" })).not.toBe(
      contractorsFilterKey(filter),
    );
  });
});
