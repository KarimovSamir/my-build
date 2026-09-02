"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

/**
 * Хлебные крошки в шапке (ТЗ §7).
 *
 * Названия берутся из карты сегментов: путь `/orders/new` читается как
 * «Главная / Все заказы / Создать заказ». Динамические сегменты (id заказа)
 * до Фазы 3 показываются как есть — подставить название заказа будет чем,
 * когда появятся сами заказы.
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

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm">
      <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
        Главная
      </Link>

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label = segmentLabels[segment] ?? decodeURIComponent(segment);

        return (
          <Fragment key={href}>
            <span className="text-muted-foreground/50" aria-hidden>
              /
            </span>
            {isLast ? (
              <span className="font-medium">{label}</span>
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
