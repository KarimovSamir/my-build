import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Общие детали списков кабинета: пагинация, пустые состояния, скелет.
 *
 * Списков три — заказы клиента, лента компании и её предложения, — и выглядеть
 * они обязаны одинаково: «Показано N из M» и кнопки листания на разных экранах
 * не должны отличаться ни текстом, ни отступами.
 *
 * Компоненты серверные: ссылки собираются на сервере, состояния в браузере
 * им не нужны.
 */

/** Подвал списка: сколько показано и куда листать (ТЗ §7). */
export function PaginationBar({
  shown,
  total,
  page,
  totalPages,
  hrefFor,
}: {
  shown: number;
  total: number;
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <span>
        Показано {shown} из {total}
      </span>

      <div className="flex gap-2">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1}>
          Назад
        </PageLink>
        <PageLink href={hrefFor(page + 1)} disabled={page >= totalPages}>
          Вперёд
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}

/** Список пуст: объяснение и действие, которым это исправить. */
export function EmptyCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Страница за пределами выборки: записи есть, но не на этой странице.
 * Рисуется внутри карточки списка, рядом с пагинацией, — своей рамки не имеет.
 */
export function OutOfRange({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <p className="text-sm font-medium">{label}</p>
      <Button variant="outline" size="sm" asChild>
        <Link href={href}>К первой странице</Link>
      </Button>
    </div>
  );
}

/**
 * Заглушка списка карточек на время запроса.
 * Повторяет ритм настоящих карточек — чтобы при появлении данных страница
 * не прыгала.
 */
export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="gap-0 p-0">
      <ul className="divide-border divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-28" />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
    </Card>
  );
}
