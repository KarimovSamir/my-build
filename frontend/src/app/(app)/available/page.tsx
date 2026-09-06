import { Suspense } from "react";

import { CardListSkeleton } from "@/components/list-parts";
import { ListSearch } from "@/components/list-search";
import { AvailableOrdersList } from "@/components/offers/available-orders-list";
import { PageHeader } from "@/components/page-shell";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Card, CardContent } from "@/components/ui/card";
import { availableFilterKey, parseAvailableFilter } from "@/lib/available-filter";
import { COMPANY_FEED_EVENTS } from "@/lib/live-updates";

export const metadata = { title: "Доступные заказы" };

/**
 * Лента доступных заказов (ТЗ §4.1, §7).
 *
 * Поиск рендерится сразу, а сама лента — под `<Suspense>` с ключом по фильтру:
 * при смене выборки скелет показывается только на месте списка, поэтому поле
 * поиска не перерисовывается и не теряет фокус при наборе.
 */
export default async function AvailableOrdersPage({
  searchParams,
}: PageProps<"/available">) {
  const filter = parseAvailableFilter(await searchParams);

  return (
    <>
      {/* Подписка на комнату `company-feed`: новый заказ появляется в ленте
          без перезагрузки (ТЗ §8). */}
      <LiveRefresh events={COMPANY_FEED_EVENTS} feed />

      <PageHeader
        title="Доступные заказы"
        description="Заказы, которые ищут исполнителя. Предложите цену и срок — клиент выберет из предложений"
      />

      <Card>
        <CardContent>
          <ListSearch
            id="available-search"
            basePath="/available"
            value={filter.q}
            label="Поиск заказов"
            placeholder="Поиск по номеру или названию заказа"
          />
        </CardContent>
      </Card>

      <Suspense key={availableFilterKey(filter)} fallback={<CardListSkeleton />}>
        <AvailableOrdersList filter={filter} />
      </Suspense>
    </>
  );
}
