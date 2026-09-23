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
    // На десктопе вкладки переносятся: их семь, в одну строку они не влезают
    // даже на широком экране, а спрятанную за краем вкладку не видно вовсе.
    // На узком экране перенос дал бы четыре строки на пол-экрана, поэтому
    // там они остаются горизонтальной лентой.
    <nav
      aria-label={label}
      className="scrollbar-slim -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-x-visible md:pb-0"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring/50 flex items-center rounded-lg px-3.5 py-2 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:outline-none",
            // Выбранная вкладка — плашка цвета текста, а не бледный акцент:
            // вкладок семь, и среди светлых прямоугольников выбранная терялась.
            // Именно `foreground`, а не `--brand-ink` из макета: чернильная
            // плашка в тёмной теме сливалась бы с фоном карточки.
            tab.active
              ? "bg-foreground text-background font-semibold"
              : "text-secondary-foreground hover:bg-secondary",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
