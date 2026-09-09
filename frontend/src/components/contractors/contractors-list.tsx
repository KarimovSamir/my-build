import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { DEFAULT_PAGE_SIZE, type ContractorCard, type Paginated } from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api.server";
import { completedOrdersText, contractorLocation } from "@/lib/contractor-view";
import { contractorsHref, isEmptyContractorsFilter } from "@/lib/contractors-filter";
import type { ContractorsFilter } from "@/lib/contractors-filter";
import { initialOf } from "@/lib/format";

/**
 * Каталог подрядчиков (ТЗ §5, §7).
 *
 * В строке — то, по чему компанию выбирают глазами: название, город и число
 * завершённых заказов. Контакты остались карточке: в списке из десяти строк
 * почта и телефон превращаются в шум, а нужны они уже после выбора.
 */
export async function ContractorsList({ filter }: { filter: ContractorsFilter }) {
  const page = await serverApi.get<Paginated<ContractorCard>>("/contractors", {
    query: {
      q: filter.q,
      page: filter.page,
      // Размер страницы задаётся явно, а не берётся из умолчания backend:
      // иначе смена умолчания на сервере молча меняла бы вид экрана.
      pageSize: DEFAULT_PAGE_SIZE,
    },
  });

  if (page.total === 0) {
    return isEmptyContractorsFilter(filter) ? (
      <EmptyCard
        title="Подрядчиков пока нет"
        description="Здесь появятся строительные компании, зарегистрированные на площадке."
      />
    ) : (
      <EmptyCard
        title="Ничего не найдено"
        description="Попробуйте изменить запрос — искать можно по названию компании и городу."
      >
        <Button variant="outline" asChild>
          <Link href={contractorsHref()}>Сбросить поиск</Link>
        </Button>
      </EmptyCard>
    );
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={contractorsHref({ q: filter.q })}
          label="На этой странице подрядчиков нет"
        />
      ) : (
        <ul className="divide-border divide-y">
          {page.items.map((contractor) => (
            <ContractorRow key={contractor.id} contractor={contractor} />
          ))}
        </ul>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => contractorsHref({ ...filter, page: next })}
      />
    </Card>
  );
}

function ContractorRow({ contractor }: { contractor: ContractorCard }) {
  const location = contractorLocation(contractor);

  return (
    <li>
      {/*
        Ссылка на всю строку, а не только на название: строка целиком ведёт
        в одно место, и кликать в неё удобнее — особенно пальцем.
      */}
      <Link
        href={`/contractors/${contractor.id}`}
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
      >
        <Avatar className="size-10 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground font-medium">
            {initialOf(contractor.companyName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{contractor.companyName}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {location ?? "Город не указан"}
          </p>
        </div>

        {/*
          На узком экране счётчик уходит на свою строку целиком: в одну строку
          с городом он не помещался и обрывался многоточием на полуслове.
        */}
        <span className="text-muted-foreground order-1 basis-full text-xs sm:order-none sm:basis-auto">
          {completedOrdersText(contractor.completedOrdersCount)}
        </span>

        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}
