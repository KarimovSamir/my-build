import { describe, expect, it } from "vitest";

import { Role } from "@/lib/types";

import { getHomeHref, getNavigation, isNavItemActive, SESSION_ISSUE_PAGES } from "./navigation";

function hrefs(role: Role): string[] {
  return getNavigation(role).flatMap((section) => section.items.map((item) => item.href));
}

describe("getHomeHref", () => {
  it("ведёт в кабинет роли", () => {
    expect(getHomeHref(Role.CLIENT)).toBe("/orders");
    expect(getHomeHref(Role.COMPANY)).toBe("/available");
  });

  it("без роли ведёт на служебный экран, а не в кабинет", () => {
    // Роли нет — значит, в проекте Supabase не включён хук. Раздела, который
    // что-то показал бы такому пользователю, не существует.
    expect(getHomeHref(null)).toBe(SESSION_ISSUE_PAGES.missingRole);
  });
});

describe("getNavigation", () => {
  it("не показывает роли чужие разделы", () => {
    expect(hrefs(Role.COMPANY)).not.toContain("/orders");
    expect(hrefs(Role.COMPANY)).not.toContain("/orders/new");
    expect(hrefs(Role.COMPANY)).not.toContain("/contractors");

    expect(hrefs(Role.CLIENT)).not.toContain("/available");
    expect(hrefs(Role.CLIENT)).not.toContain("/offers");
  });

  it("начинается с кабинета роли", () => {
    for (const role of [Role.CLIENT, Role.COMPANY]) {
      expect(hrefs(role)[0]).toBe(getHomeHref(role));
    }
  });

  it("даёт обеим ролям общие разделы", () => {
    for (const role of [Role.CLIENT, Role.COMPANY]) {
      expect(hrefs(role)).toEqual(
        expect.arrayContaining(["/documents", "/notifications", "/settings"]),
      );
    }
  });
});

describe("isNavItemActive", () => {
  it("«Все заказы» подсвечиваются на списке и на странице заказа", () => {
    expect(isNavItemActive("/orders", "/orders")).toBe(true);
    expect(isNavItemActive("/orders", "/orders/6f1c7a0e-0000-4000-8000-000000000001")).toBe(true);
  });

  it("«Все заказы» не подсвечиваются на создании заказа", () => {
    // Иначе подсвечены сразу два пункта меню.
    expect(isNavItemActive("/orders", "/orders/new")).toBe(false);
    expect(isNavItemActive("/orders/new", "/orders/new")).toBe(true);
    expect(isNavItemActive("/orders/new", "/orders")).toBe(false);
  });

  it("обычный раздел подсвечивается на себе и на вложенных путях", () => {
    expect(isNavItemActive("/documents", "/documents")).toBe(true);
    expect(isNavItemActive("/documents", "/documents/123")).toBe(true);
  });

  it("чужой раздел не подсвечивается", () => {
    expect(isNavItemActive("/documents", "/notifications")).toBe(false);
    // Совпадение по началу строки не считается: `/offers` ≠ `/offers-archive`.
    expect(isNavItemActive("/offers", "/offers-archive")).toBe(false);
  });
});
