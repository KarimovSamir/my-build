import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Вкладки-фильтры по статусу: у заказов клиента (ТЗ §4.1) и у предложений
 * компании (ТЗ §5) они устроены одинаково.
 *
 * Это ссылки, а не переключатель на состоянии: вкладка меняет выборку, и она
 * обязана оставаться в адресе. Названия статусов приходят из `shared/`, поэтому
 * вкладка и badge подписаны одним и тем же словом.
 */

export interface StatusTab {
  label: string;
  href: string;
  active: boolean;
}

export function StatusTabs({ label, tabs }: { label: string; tabs: StatusTab[] }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring/50 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:outline-none",
            tab.active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
