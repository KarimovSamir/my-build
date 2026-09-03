import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Заголовок раздела с подзаголовком и местом под кнопку действия.
 *
 * `description` — узел, а не строка: на странице заказа под заголовком идёт
 * badge статуса вперемешку с текстом, а заводить ради этого второй компонент
 * заголовка значило бы развести отступы разных экранов.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <div className="text-muted-foreground mt-1 text-sm">{description}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Заглушка раздела или блока, который появится в следующей фазе.
 *
 * Показывает, что именно здесь будет и когда — чтобы пустой экран не выглядел
 * поломкой ни для нас, ни для того, кому проект показывают. `title` нужен,
 * когда заглушка стоит не вместо целой страницы, а блоком среди готовых
 * карточек: без заголовка непонятно, чьё это место.
 */
export function ComingSoon({
  title,
  phase,
  children,
}: {
  title?: string;
  phase: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-dashed shadow-none">
      {title ? (
        <CardHeader>
          <CardTitle className="text-muted-foreground">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium">{children}</p>
        <p className="text-muted-foreground text-xs">Появится в {phase}</p>
      </CardContent>
    </Card>
  );
}
