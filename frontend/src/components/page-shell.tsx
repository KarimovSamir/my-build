import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

/** Заголовок раздела с подзаголовком и местом под кнопку действия. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Заглушка раздела, который появится в следующей фазе.
 *
 * Показывает, что именно здесь будет и когда — чтобы пустой экран не выглядел
 * поломкой ни для нас, ни для того, кому проект показывают.
 */
export function ComingSoon({ phase, children }: { phase: string; children: ReactNode }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
        <p className="text-sm font-medium">{children}</p>
        <p className="text-muted-foreground text-xs">Появится в {phase}</p>
      </CardContent>
    </Card>
  );
}
