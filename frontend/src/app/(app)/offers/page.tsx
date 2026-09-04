import { Suspense } from "react";

import { offerStatusLabels } from "@/lib/types";

import { CardListSkeleton } from "@/components/list-parts";
import { CompanyOffersList } from "@/components/offers/company-offers-list";
import { PageHeader } from "@/components/page-shell";
import { StatusTabs } from "@/components/status-tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  companyOffersFilterKey,
  companyOffersHref,
  OFFER_STATUS_TABS,
  parseCompanyOffersFilter,
} from "@/lib/offers-filter";

export const metadata = { title: "Мои предложения" };

/** Мои предложения по статусам (ТЗ §5, §7). */
export default async function OffersPage({ searchParams }: PageProps<"/offers">) {
  const filter = parseCompanyOffersFilter(await searchParams);

  return (
    <>
      <PageHeader
        title="Мои предложения"
        description="Отправленные предложения и то, что с ними стало"
      />

      <Card>
        <CardContent>
          <StatusTabs
            label="Фильтр по статусу предложения"
            tabs={[
              {
                label: "Все предложения",
                href: companyOffersHref(),
                active: filter.status === null,
              },
              ...OFFER_STATUS_TABS.map((status) => ({
                label: offerStatusLabels[status],
                href: companyOffersHref({ status }),
                active: filter.status === status,
              })),
            ]}
          />
        </CardContent>
      </Card>

      <Suspense key={companyOffersFilterKey(filter)} fallback={<CardListSkeleton />}>
        <CompanyOffersList filter={filter} />
      </Suspense>
    </>
  );
}
