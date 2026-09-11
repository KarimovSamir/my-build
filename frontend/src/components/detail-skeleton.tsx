import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Заглушка карточки сущности на время запроса.
 *
 * Обе карточки проекта — заказа и подрядчика — собраны одинаково: заголовок
 * с подписью и кнопкой, под ним сетка «основное слева, врезка справа».
 * Различаются они только числом блоков, поэтому скелет один на оба экрана,
 * а не два почти одинаковых файла.
 *
 * Числа блоков задаются вызывающим: пустая колонка на широком экране выглядит
 * как обрыв вёрстки, а лишняя — как данные, которых потом не появится.
 */
export function DetailSkeleton({
  mainCards = 2,
  asideCards = 1,
}: {
  mainCards?: number;
  asideCards?: number;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {Array.from({ length: mainCards }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {Array.from({ length: asideCards }, (_, index) => (
            <CardSkeleton key={index} rows={4} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Полоски разной длины: ровный столбик читается как таблица, а не как текст. */
const ROW_WIDTHS = ["w-full", "w-5/6", "w-2/3", "w-3/4"] as const;

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={`h-4 ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
        ))}
      </CardContent>
    </Card>
  );
}
