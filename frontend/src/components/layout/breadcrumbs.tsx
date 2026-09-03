"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { getHomeHref } from "@/lib/navigation";
import { Role } from "@/lib/types";

/**
 * Хлебные крошки в шапке (ТЗ §7).
 *
 * Названия берутся из карты сегментов: путь `/orders/new` читается как
 * «Главная / Все заказы / Создать заказ».
 *
 * Идентификатор заказа в путь крошек не годится — вместо него стоит слово
 * «Заказ». Подставить сюда номер `ORD-24` было бы точнее, но крошки живут
 * в шапке кабинета, то есть в layout'е, а данные заказа читает страница:
 * layout к ним доступа не имеет. Номер заказа виден в заголовке страницы.
 */
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

/** Динамический сегмент — идентификатор сущности, а не название раздела. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function Breadcrumbs({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // «Главная» ведёт в кабинет роли, а не на лендинг: с `/` вошедшего
  // немедленно перекидывает обратно, то есть ссылка не делала ничего.
  // Когда первый сегмент — сам кабинет, крошка не нужна: она вела бы туда же,
  // куда и соседняя.
  const homeHref = getHomeHref(role);
  const showHome = segments.length === 0 || `/${segments[0]}` !== homeHref;

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm">
      {showHome ? (
        <Link
          href={homeHref}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Главная
        </Link>
      ) : null}

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label =
          segmentLabels[segment] ?? (UUID.test(segment) ? "Заказ" : decodeSegment(segment));

        return (
          <Fragment key={href}>
            {showHome || index > 0 ? (
              <span className="text-muted-foreground/50" aria-hidden>
                /
              </span>
            ) : null}
            {isLast || !isReachable(href, role) ? (
              <span className={isLast ? "font-medium" : "text-muted-foreground"}>
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
