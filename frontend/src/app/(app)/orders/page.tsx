import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ListSearch } from "@/components/list-search";
import { OrdersList } from "@/components/orders/orders-list";
import { OrdersListSkeleton } from "@/components/orders/orders-list-skeleton";
import { OrdersStatusTabs } from "@/components/orders/orders-status-tabs";
import { PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ordersFilterKey, parseOrdersFilter } from "@/lib/orders-filter";

export const metadata = { title: "Все заказы" };

/**
 * Все заказы клиента (ТЗ §7).
 *
 * Поиск и вкладки рендерятся сразу, а сам список — под `<Suspense>` с ключом
 * по фильтру: при смене выборки скелет показывается только на месте таблицы,
 * поэтому поле поиска не перерисовывается и не теряет фокус при наборе.
 */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const filter = parseOrdersFilter(await searchParams);

  return (
    <>
      <PageHeader
        title="Все заказы"
        description="Управляйте вашими текущими и завершёнными проектами"
        action={
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="size-4" />
              Создать заказ
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <ListSearch
            id="orders-search"
            basePath="/orders"
            params={{ status: filter.status }}
            value={filter.q}
            label="Поиск заказов"
            placeholder="Поиск по номеру, названию или подрядчику"
          />
          <OrdersStatusTabs filter={filter} />
        </CardContent>
      </Card>

      <Suspense key={ordersFilterKey(filter)} fallback={<OrdersListSkeleton />}>
        <OrdersList filter={filter} />
      </Suspense>
    </>
  );
}
