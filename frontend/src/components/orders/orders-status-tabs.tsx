import Link from "next/link";
import type { ReactNode } from "react";

import { orderStatusLabels } from "@/lib/types";

import { ORDER_STATUS_TABS, ordersHref, type OrdersFilter } from "@/lib/orders-filter";
import { cn } from "@/lib/utils";

/**
 * Вкладки статусов (ТЗ §4.1).
 *
 * Это ссылки, а не переключатель на состоянии: вкладка меняет выборку, и она
 * обязана оставаться в адресе. Названия берутся из `shared/`, поэтому статус
 * подписан одинаково на вкладке и на badge.
 */
export function OrdersStatusTabs({ filter }: { filter: OrdersFilter }) {
  return (
    <nav
      aria-label="Фильтр по статусу"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      <TabLink href={ordersHref({ q: filter.q })} active={filter.status === null}>
        Все заказы
      </TabLink>

      {ORDER_STATUS_TABS.map((status) => (
        <TabLink
          key={status}
          href={ordersHref({ q: filter.q, status })}
          active={filter.status === status}
        >
          {orderStatusLabels[status]}
        </TabLink>
      ))}
    </nav>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:outline-none",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
