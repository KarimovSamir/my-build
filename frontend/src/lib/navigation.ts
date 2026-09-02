import {
  Bell,
  FilePlus2,
  FileText,
  LayoutGrid,
  ListChecks,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@mybuild/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  /** Заголовок группы. Первая группа идёт без заголовка (как на макете). */
  title?: string;
  items: NavItem[];
}

/**
 * Разделы бокового меню по ролям (ТЗ §7).
 *
 * Пути специально не пересекаются между ролями: в Next.js две группы роутов
 * не могут объявлять один и тот же URL. Поэтому у компании — `/available`
 * и `/offers`, а общие разделы (`/orders/[id]`, `/documents`, `/notifications`,
 * `/settings`) — одни на обе роли и внутри различают роль сами.
 */
const clientNavigation: NavSection[] = [
  {
    items: [
      { href: "/orders", label: "Все заказы", icon: LayoutGrid },
      { href: "/orders/new", label: "Создать заказ", icon: FilePlus2 },
    ],
  },
  {
    title: "Меню",
    items: [
      { href: "/contractors", label: "Подрядчики", icon: Users },
      { href: "/documents", label: "Документы", icon: FileText },
      { href: "/notifications", label: "Уведомления", icon: Bell },
      { href: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

const companyNavigation: NavSection[] = [
  {
    items: [
      { href: "/available", label: "Доступные заказы", icon: Search },
      { href: "/offers", label: "Мои предложения", icon: ListChecks },
    ],
  },
  {
    title: "Меню",
    items: [
      { href: "/documents", label: "Документы", icon: FileText },
      { href: "/notifications", label: "Уведомления", icon: Bell },
      { href: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

export function getNavigation(role: Role): NavSection[] {
  return role === "COMPANY" ? companyNavigation : clientNavigation;
}

/** Куда отправляем пользователя сразу после входа. */
export function getHomeHref(role: Role): string {
  return role === "COMPANY" ? "/available" : "/orders";
}

/**
 * Активен ли пункт меню для текущего пути.
 * `/orders` не должен подсвечиваться, когда открыт `/orders/new`.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/orders") {
    return pathname === "/orders" || /^\/orders\/(?!new$)[^/]+$/.test(pathname);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
