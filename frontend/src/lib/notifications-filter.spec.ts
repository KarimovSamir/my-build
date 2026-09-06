import { describe, expect, it } from "vitest";

import { MAX_PAGE } from "@/lib/types";

import {
  notificationsFilterKey,
  notificationsHref,
  parseNotificationsFilter,
} from "./notifications-filter";

describe("parseNotificationsFilter", () => {
  it("по умолчанию — все уведомления, первая страница", () => {
    expect(parseNotificationsFilter({})).toEqual({ unread: false, page: 1 });
  });

  it("читает вкладку непрочитанных", () => {
    expect(parseNotificationsFilter({ unread: "true" })).toEqual({
      unread: true,
      page: 1,
    });
  });

  /**
   * Всё, кроме `true`, — это «фильтра нет». Отдельного «только прочитанные»
   * в интерфейсе нет: такой список ни о чём не говорит.
   */
  it.each([
    ["false", "false"],
    ["единица", "1"],
    ["мусор", "yes"],
    ["пусто", ""],
  ])("%s читается как «все»", (_, value) => {
    expect(parseNotificationsFilter({ unread: value }).unread).toBe(false);
  });

  it("из повторяющегося параметра берёт первый", () => {
    expect(parseNotificationsFilter({ unread: ["true", "false"] }).unread).toBe(true);
  });

  it.each([
    ["нечисло", "abc"],
    ["ноль", "0"],
    ["отрицательная", "-2"],
    ["дробная", "1.5"],
    ["за потолком backend", String(MAX_PAGE + 1)],
  ])("%s страница читается как первая", (_, value) => {
    expect(parseNotificationsFilter({ page: value }).page).toBe(1);
  });

  it("берёт страницу из адреса", () => {
    expect(parseNotificationsFilter({ page: "4" }).page).toBe(4);
  });
});

describe("notificationsHref", () => {
  it("умолчания в адрес не пишет", () => {
    expect(notificationsHref()).toBe("/notifications");
    expect(notificationsHref({ unread: false, page: 1 })).toBe("/notifications");
  });

  it("собирает вкладку и страницу", () => {
    expect(notificationsHref({ unread: true })).toBe("/notifications?unread=true");
    expect(notificationsHref({ unread: true, page: 3 })).toBe(
      "/notifications?unread=true&page=3",
    );
  });

  it("разбирается обратно в тот же фильтр", () => {
    const filter = { unread: true, page: 2 };
    const params = new URL(notificationsHref(filter), "http://localhost").searchParams;

    expect(parseNotificationsFilter(Object.fromEntries(params))).toEqual(filter);
  });
});

describe("notificationsFilterKey", () => {
  it("различает вкладки и страницы", () => {
    const keys = [
      notificationsFilterKey({ unread: false, page: 1 }),
      notificationsFilterKey({ unread: true, page: 1 }),
      notificationsFilterKey({ unread: true, page: 2 }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});
