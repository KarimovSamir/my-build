import { describe, expect, it } from "vitest";

import { Role } from "@/lib/types";

import { buildBreadcrumbs, type Crumb } from "./breadcrumbs";

const ORDER_ID = "6f1c7a0e-0000-4000-8000-000000000001";

/** Крошки в виде «подпись → адрес», где `null` — текст без ссылки. */
function trail(pathname: string, role: Role | null): [string, string | null][] {
  return buildBreadcrumbs(pathname, role).map((crumb) => [crumb.label, crumb.href]);
}

function current(crumbs: Crumb[]): Crumb | undefined {
  return crumbs.find((crumb) => crumb.current);
}

describe("buildBreadcrumbs", () => {
  it("собирает путь из названий разделов", () => {
    expect(trail("/orders/new", Role.CLIENT)).toEqual([
      ["Все заказы", "/orders"],
      ["Создать заказ", null],
    ]);
  });

  it("не показывает «Главную», когда первый сегмент и есть кабинет роли", () => {
    // Иначе две соседние крошки вели бы в одно и то же место.
    expect(trail("/orders", Role.CLIENT)[0]).toEqual(["Все заказы", null]);
    expect(trail("/available", Role.COMPANY)[0]).toEqual(["Доступные заказы", null]);
  });

  it("показывает «Главную» в чужом разделе и ведёт ею в кабинет роли", () => {
    expect(trail("/documents", Role.CLIENT)).toEqual([
      ["Главная", "/orders"],
      ["Документы", null],
    ]);
    expect(trail("/documents", Role.COMPANY)[0]).toEqual(["Главная", "/available"]);
  });

  it("без роли ведёт «Главной» на служебный экран", () => {
    expect(trail("/settings", null)[0]).toEqual(["Главная", "/no-role"]);
  });

  it("вместо идентификатора заказа показывает слово «Заказ»", () => {
    expect(trail(`/orders/${ORDER_ID}`, Role.CLIENT)).toEqual([
      ["Все заказы", "/orders"],
      ["Заказ", null],
    ]);
  });

  it("у компании «Все заказы» остаются текстом: такого раздела у неё нет", () => {
    // Ссылка, с которой proxy сразу уводит на ленту, хуже, чем её отсутствие.
    expect(trail(`/orders/${ORDER_ID}`, Role.COMPANY)).toEqual([
      ["Главная", "/available"],
      ["Все заказы", null],
      ["Заказ", null],
    ]);
  });

  it("не падает на неправильной процентной последовательности", () => {
    // `/orders/%` уронил бы `decodeURIComponent` прямо в шапке кабинета.
    expect(() => buildBreadcrumbs("/orders/%", Role.CLIENT)).not.toThrow();
    expect(trail("/orders/%", Role.CLIENT).at(-1)).toEqual(["%", null]);
  });

  it("раскодирует обычный сегмент", () => {
    expect(trail("/orders/%D0%B4%D0%BE%D0%BC", Role.CLIENT).at(-1)).toEqual(["дом", null]);
  });

  it("текущей помечает последнюю крошку", () => {
    const crumbs = buildBreadcrumbs("/orders/new", Role.CLIENT);

    expect(current(crumbs)?.label).toBe("Создать заказ");
    expect(crumbs.filter((crumb) => crumb.current)).toHaveLength(1);
  });

  it("на корне оставляет одну «Главную», и она не текущая", () => {
    expect(buildBreadcrumbs("/", Role.CLIENT)).toEqual([
      { label: "Главная", href: "/orders", current: false },
    ]);
  });
});
