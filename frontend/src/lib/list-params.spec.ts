import { describe, expect, it } from "vitest";

import { MAX_PAGE, OrderStatus } from "@/lib/types";

import {
  firstParam,
  listHref,
  readEnumParam,
  readPageParam,
  readQueryParam,
} from "./list-params";

describe("firstParam", () => {
  it("из повторяющегося параметра берёт первое значение", () => {
    expect(firstParam(["2", "9"])).toBe("2");
    expect(firstParam("2")).toBe("2");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("readEnumParam", () => {
  const known = new Set<string>(Object.values(OrderStatus));

  it("читает известное значение", () => {
    expect(readEnumParam(OrderStatus.IN_PROGRESS, known)).toBe(OrderStatus.IN_PROGRESS);
  });

  it("неизвестное читает как «фильтра нет»", () => {
    expect(readEnumParam("DELETED", known)).toBeNull();
    expect(readEnumParam(undefined, known)).toBeNull();
  });
});

describe("readQueryParam", () => {
  it("обрезает строку по краям", () => {
    expect(readQueryParam("  ремонт  ")).toBe("ремонт");
  });

  it("обрезает строку до длины, которую принимает backend", () => {
    // Больше 200 символов backend отклонит с 400 — обрезаем до запроса.
    expect(readQueryParam("я".repeat(250))).toHaveLength(200);
  });
});

describe("readPageParam", () => {
  it("любую невалидную страницу читает как первую", () => {
    for (const page of ["0", "-1", "abc", "1.5", "1e30", ""]) {
      expect(readPageParam(page)).toBe(1);
    }
  });

  it("читает номер страницы", () => {
    expect(readPageParam("3")).toBe(3);
    expect(readPageParam(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it("страницу за потолком backend читает как первую", () => {
    // Иначе запрос ушёл бы в API и вернулся ответом 400, а не пустым списком.
    for (const page of [MAX_PAGE + 1, 1e15, Number.MAX_SAFE_INTEGER]) {
      expect(readPageParam(String(page))).toBe(1);
    }
  });
});

describe("listHref", () => {
  it("без параметров даёт чистый адрес раздела", () => {
    expect(listHref("/offers", {})).toBe("/offers");
    expect(listHref("/offers", { status: null, page: undefined, q: "" })).toBe("/offers");
  });

  it("кодирует значения", () => {
    const href = listHref("/orders", { q: "ремонт кухни", page: 2 });

    expect(Object.fromEntries(new URL(href, "http://localhost").searchParams)).toEqual({
      q: "ремонт кухни",
      page: "2",
    });
  });
});
