import { describe, expect, it } from "vitest";

import {
  availableFilterKey,
  availableHref,
  isEmptyAvailableFilter,
  parseAvailableFilter,
  type AvailableFilter,
} from "./available-filter";

/** Параметры адреса в том виде, в каком их отдаёт Next.js странице. */
function searchParams(href: string): Record<string, string | string[]> {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("parseAvailableFilter", () => {
  it("читает поиск и страницу", () => {
    expect(parseAvailableFilter({ q: "  ремонт ", page: "3" })).toEqual({
      q: "ремонт",
      page: 3,
    });
  });

  it("пустые параметры дают первую страницу без поиска", () => {
    expect(parseAvailableFilter({})).toEqual({ q: "", page: 1 });
  });
});

describe("availableHref", () => {
  it("без фильтра даёт чистый адрес раздела", () => {
    expect(availableHref()).toBe("/available");
    expect(availableHref({ q: "", page: 1 })).toBe("/available");
  });

  it("собранный адрес читается обратно тем же фильтром", () => {
    const filter: AvailableFilter = { q: "ORD-7829", page: 4 };

    expect(parseAvailableFilter(searchParams(availableHref(filter)))).toEqual(filter);
  });
});

describe("isEmptyAvailableFilter", () => {
  it("пустым считается фильтр без поиска: страница выборкой не является", () => {
    expect(isEmptyAvailableFilter({ q: "", page: 5 })).toBe(true);
    expect(isEmptyAvailableFilter({ q: "дом", page: 1 })).toBe(false);
  });
});

describe("availableFilterKey", () => {
  it("одинаковые фильтры дают один ключ, разные — разные", () => {
    const filter: AvailableFilter = { q: "дом", page: 1 };

    expect(availableFilterKey(filter)).toBe(availableFilterKey({ ...filter }));
    expect(availableFilterKey({ ...filter, page: 2 })).not.toBe(availableFilterKey(filter));
    expect(availableFilterKey({ ...filter, q: "дача" })).not.toBe(availableFilterKey(filter));
  });
});
