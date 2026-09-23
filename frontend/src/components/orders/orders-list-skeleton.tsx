import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Заглушка списка на время запроса.
 *
 * Повторяет высоту и ритм настоящих строк — чтобы при появлении данных
 * страница не прыгала.
 */
export function OrdersListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="gap-0 p-0">
      <div className="bg-brand-surface hidden h-11 border-b md:block" />

      <ul className="divide-border divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center gap-5 px-5 py-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="hidden h-4 w-32 md:block" />
            <Skeleton className="h-7 w-36 rounded-full" />
            <Skeleton className="hidden h-4 w-24 md:block" />
          </li>
        ))}
      </ul>

      <div className="bg-brand-surface flex items-center justify-between gap-3 border-t px-5 py-3.5">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
    </Card>
  );
}
