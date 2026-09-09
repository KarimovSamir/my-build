import { Suspense } from "react";

import { ContractorsList } from "@/components/contractors/contractors-list";
import { CardListSkeleton } from "@/components/list-parts";
import { ListSearch } from "@/components/list-search";
import { PageHeader } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  contractorsFilterKey,
  parseContractorsFilter,
} from "@/lib/contractors-filter";

export const metadata = { title: "Подрядчики" };

/**
 * Каталог подрядчиков (ТЗ §7) — раздел клиента.
 *
 * Поиск рендерится сразу, а список — под `<Suspense>` с ключом по фильтру:
 * при смене запроса скелет показывается только на месте списка, поэтому поле
 * поиска не перерисовывается и не теряет фокус при наборе.
 *
 * Живого обновления здесь нет намеренно: событий про регистрацию компаний
 * в ТЗ §8 не существует, а каталог меняется от силы раз в день.
 */
export default async function ContractorsPage({
  searchParams,
}: PageProps<"/contractors">) {
  const filter = parseContractorsFilter(await searchParams);

  return (
    <>
      <PageHeader
        title="Подрядчики"
        description="Каталог зарегистрированных строительных компаний"
      />

      <Card>
        <CardContent>
          <ListSearch
            id="contractors-search"
            basePath="/contractors"
            value={filter.q}
            label="Поиск подрядчиков"
            placeholder="Поиск по названию или городу"
          />
        </CardContent>
      </Card>

      <Suspense key={contractorsFilterKey(filter)} fallback={<CardListSkeleton />}>
        <ContractorsList filter={filter} />
      </Suspense>
    </>
  );
}
