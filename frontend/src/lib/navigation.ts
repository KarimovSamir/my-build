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

import { Role } from "@/lib/types";

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
  return role === Role.COMPANY ? companyNavigation : clientNavigation;
}

/**
 * Служебные экраны: вход выполнен, но пользоваться кабинетом нельзя.
 *
 * Оба случая — поломка настройки проекта Supabase, а не действие пользователя,
 * поэтому экран обязан назвать причину: иначе человек видит пустой кабинет
 * и не понимает, что произошло. Разделы кабинета до этих экранов не доходят —
 * `proxy.ts` уводит сюда раньше.
 */
export const SESSION_ISSUE_PAGES = {
  /** Email не подтверждён (ТЗ §6). */
  unverifiedEmail: "/verify-email",
  /** В токене нет claim'а `user_role`: не включён Custom Access Token Hook. */
  missingRole: "/no-role",
} as const;

/**
 * Куда отправляем пользователя сразу после входа.
 *
 * Роли может не быть, если в проекте Supabase не включён хук, добавляющий
 * claim `user_role`. Раздела, который что-то показал бы такому пользователю,
 * не существует — ведём на служебный экран с объяснением.
 */
export function getHomeHref(role: Role | null): string {
  if (role === Role.COMPANY) return "/available";
  if (role === Role.CLIENT) return "/orders";

  return SESSION_ISSUE_PAGES.missingRole;
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
