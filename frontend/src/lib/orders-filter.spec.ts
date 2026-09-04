import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/lib/types";

import {
  isEmptyFilter,
  ordersFilterKey,
  ordersHref,
  parseOrdersFilter,
  type OrdersFilter,
} from "./orders-filter";

/** Параметры адреса в том виде, в каком их отдаёт Next.js странице. */
function searchParams(href: string): Record<string, string | string[]> {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("parseOrdersFilter", () => {
  it("читает известный статус", () => {
    expect(parseOrdersFilter({ status: OrderStatus.IN_PROGRESS }).status).toBe(
      OrderStatus.IN_PROGRESS,
    );
  });

  it("неизвестный статус читает как «все заказы»", () => {
    expect(parseOrdersFilter({ status: "DELETED" }).status).toBeNull();
    expect(parseOrdersFilter({}).status).toBeNull();
  });

  it("обрезает поисковую строку по краям", () => {
    expect(parseOrdersFilter({ q: "  ремонт  " }).q).toBe("ремонт");
  });

  it("обрезает поисковую строку до длины, которую принимает backend", () => {
    // Больше 200 символов backend отклонит с 400 — обрезаем до запроса.
    expect(parseOrdersFilter({ q: "я".repeat(250) }).q).toHaveLength(200);
  });

  it("любую невалидную страницу читает как первую", () => {
    for (const page of ["0", "-1", "abc", "1.5", "1e30", ""]) {
      expect(parseOrdersFilter({ page }).page).toBe(1);
    }
  });

  it("читает номер страницы", () => {
    expect(parseOrdersFilter({ page: "3" }).page).toBe(3);
  });

  it("из повторяющегося параметра берёт первое значение", () => {
    const filter = parseOrdersFilter({
      status: [OrderStatus.WAITING, OrderStatus.COMPLETED],
      q: ["дом", "дача"],
      page: ["2", "9"],
    });

    expect(filter).toEqual({ status: OrderStatus.WAITING, q: "дом", page: 2 });
  });
});

describe("ordersHref", () => {
  it("без фильтра даёт чистый адрес раздела", () => {
    expect(ordersHref()).toBe("/orders");
    expect(ordersHref({ status: null, q: "", page: 1 })).toBe("/orders");
  });

  it("не пишет в адрес первую страницу", () => {
    expect(ordersHref({ page: 1 })).toBe("/orders");
    expect(ordersHref({ page: 2 })).toBe("/orders?page=2");
  });

  it("кодирует статус и поисковую строку", () => {
    const href = ordersHref({ status: OrderStatus.WAITING, q: "ремонт кухни" });

    expect(searchParams(href)).toEqual({ status: OrderStatus.WAITING, q: "ремонт кухни" });
  });

  it("собранный адрес читается обратно тем же фильтром", () => {
    const filter: OrdersFilter = {
      status: OrderStatus.COMPLETION_DISPUTED,
      q: "ORD-7829",
      page: 4,
    };

    expect(parseOrdersFilter(searchParams(ordersHref(filter)))).toEqual(filter);
  });
});

describe("isEmptyFilter", () => {
  it("пустым считается только фильтр без статуса и без запроса", () => {
    expect(isEmptyFilter({ status: null, q: "", page: 1 })).toBe(true);
    // Страница фильтром не считается: «показать пусто» — это не «ничего не нашлось».
    expect(isEmptyFilter({ status: null, q: "", page: 5 })).toBe(true);
    expect(isEmptyFilter({ status: OrderStatus.WAITING, q: "", page: 1 })).toBe(false);
    expect(isEmptyFilter({ status: null, q: "дом", page: 1 })).toBe(false);
  });
});

describe("ordersFilterKey", () => {
  it("одинаковые фильтры дают один ключ, разные — разные", () => {
    const filter: OrdersFilter = { status: OrderStatus.WAITING, q: "дом", page: 1 };

    expect(ordersFilterKey(filter)).toBe(ordersFilterKey({ ...filter }));
    expect(ordersFilterKey({ ...filter, page: 2 })).not.toBe(ordersFilterKey(filter));
    expect(ordersFilterKey({ ...filter, q: "дача" })).not.toBe(ordersFilterKey(filter));
    expect(ordersFilterKey({ ...filter, status: null })).not.toBe(ordersFilterKey(filter));
  });
});
