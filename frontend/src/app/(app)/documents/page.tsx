import { Suspense } from "react";

import { DocumentsList } from "@/components/documents/documents-list";
import { OrderFilter, OrderFilterSkeleton } from "@/components/documents/order-filter";
import { CardListSkeleton } from "@/components/list-parts";
import { PageHeader } from "@/components/page-shell";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { StatusTabs } from "@/components/status-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { documentOwnerTabLabel } from "@/lib/document-view";
import {
  DOCUMENT_OWNER_TABS,
  documentsFilterKey,
  documentsHref,
  parseDocumentsFilter,
} from "@/lib/documents-filter";
import { DOCUMENTS_EVENTS } from "@/lib/live-updates";
import { getCurrentUser } from "@/lib/session.server";

export const metadata = { title: "Документы" };

/**
 * Документы: все файлы пользователя по всем его заказам (ТЗ §5, §7).
 *
 * Пятый список кабинета — собран на тех же общих частях, что и четыре прежних.
 * Фильтров два: вкладки «чьи файлы» и выбор заказа; оба живут в адресе.
 *
 * Роль нужна не для доступа — его целиком проверяет backend, — а для подписей:
 * свои файлы называются своими, и у клиента это задание, а у компании сдачи.
 */
export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const filter = parseDocumentsFilter(await searchParams);
  const { role } = await getCurrentUser();

  return (
    <>
      {/* Исполнитель загрузил файлы — событие приходит клиенту в личную
          комнату (ТЗ §8), и список пополняется без перезагрузки. */}
      <LiveRefresh events={DOCUMENTS_EVENTS} />

      <PageHeader
        title="Документы"
        description="Все файлы по всем вашим заказам в одном списке"
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <StatusTabs
            label="Фильтр по владельцу файла"
            tabs={[
              {
                label: "Все документы",
                href: documentsHref({ orderId: filter.orderId }),
                active: filter.ownerType === null,
              },
              ...DOCUMENT_OWNER_TABS.map((ownerType) => ({
                label: documentOwnerTabLabel(ownerType, role),
                href: documentsHref({ ownerType, orderId: filter.orderId }),
                active: filter.ownerType === ownerType,
              })),
            ]}
          />

          {/* Варианты фильтра — отдельный запрос к своему источнику у каждой
              роли, поэтому он ждёт под своим скелетом и не задерживает список. */}
          <Suspense fallback={<OrderFilterSkeleton />}>
            <OrderFilter filter={filter} viewer={role} />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense key={documentsFilterKey(filter)} fallback={<CardListSkeleton />}>
        <DocumentsList filter={filter} viewer={role} />
      </Suspense>
    </>
  );
}
