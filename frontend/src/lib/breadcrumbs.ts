/**
 * Хлебные крошки из пути страницы (ТЗ §7).
 *
 * Путь `/orders/new` читается как «Главная / Все заказы / Создать заказ».
 * Модуль чистый — компонент только рисует то, что здесь собрано.
 *
 * Идентификатор заказа в крошку не годится — вместо него стоит слово «Заказ».
 * Подставить номер `ORD-24` было бы точнее, но крошки живут в шапке кабинета,
 * то есть в layout'е, а данные заказа читает страница: layout к ним доступа
 * не имеет. Номер заказа виден в заголовке страницы.
 */

import { Role } from "@/lib/types";

import { UUID_PATTERN } from "./list-params";
import { getHomeHref } from "./navigation";

export interface Crumb {
  label: string;
  /** `null` — крошка показывается текстом: вести с неё некуда. */
  href: string | null;
  /** Текущая страница — последняя крошка. */
  current: boolean;
}

const segmentLabels: Record<string, string> = {
  orders: "Все заказы",
  new: "Создать заказ",
  available: "Доступные заказы",
  offers: "Мои предложения",
  contractors: "Подрядчики",
  documents: "Документы",
  notifications: "Уведомления",
  settings: "Настройки",
};

/**
 * Как назвать идентификатор в крошке. Имя даёт раздел, внутри которого он стоит:
 * `/orders/{id}` — это заказ, `/contractors/{id}` — компания.
 */
const entityLabels: Record<string, string> = {
  orders: "Заказ",
  contractors: "Компания",
};

export function buildBreadcrumbs(pathname: string, role: Role | null): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  // «Главная» ведёт в кабинет роли, а не на лендинг: с `/` вошедшего
  // немедленно перекидывает обратно, то есть ссылка не делала ничего.
  // Когда первый сегмент — сам кабинет, крошка не нужна: она вела бы туда же,
  // куда и соседняя.
  const homeHref = getHomeHref(role);
  const crumbs: Crumb[] =
    segments.length === 0 || `/${segments[0]}` !== homeHref
      ? [{ label: "Главная", href: homeHref, current: false }]
      : [];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const current = index === segments.length - 1;

    crumbs.push({
      label: crumbLabel(segment, segments[index - 1]),
      href: current || !isReachable(href, role) ? null : href,
      current,
    });
  });

  return crumbs;
}

function crumbLabel(segment: string, parent: string | undefined): string {
  const known = segmentLabels[segment];

  if (known) return known;

  // Идентификатор в подпись не годится, но и назвать его можно только по
  // разделу: раздела нет в списке — показываем сегмент как есть.
  return (
    (UUID_PATTERN.test(segment) ? entityLabels[parent ?? ""] : undefined) ??
    decodeSegment(segment)
  );
}

/**
 * Разделы, которых у роли нет: их крошка остаётся текстом.
 *
 * Компания попадает на `/orders/{id}` по своему предложению, но самого раздела
 * «Все заказы» у неё не существует — `proxy.ts` увёл бы её оттуда на ленту.
 * Ссылка, которая перекидывает в другой раздел, хуже, чем её отсутствие.
 */
function isReachable(href: string, role: Role | null): boolean {
  return !(role === Role.COMPANY && href === "/orders");
}

/**
 * Адрес в пути может быть закодирован как угодно, в том числе неправильно:
 * `/orders/%` уронил бы `decodeURIComponent` прямо в шапке кабинета.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
