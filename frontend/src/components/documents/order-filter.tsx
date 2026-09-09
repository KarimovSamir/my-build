import {
  MAX_PAGE_SIZE,
  Role,
  type CompanyOfferItem,
  type OrderListItem,
  type Paginated,
} from "@/lib/types";

import { OrderSelect } from "@/components/documents/order-select";
import { Skeleton } from "@/components/ui/skeleton";
import { serverApi } from "@/lib/api.server";
import { toOrderOptions, withSelectedOrder } from "@/lib/document-view";
import type { DocumentsFilter } from "@/lib/documents-filter";

/**
 * Варианты фильтра «Заказ» (ТЗ §7).
 *
 * Своего маршрута «мои заказы одним списком» в API нет, и заводить его ради
 * фильтра не стали: у каждой роли уже есть свой источник — заказы клиента
 * и принятые предложения компании. Правило то же, что у `buildDocumentsWhere`
 * на backend: документы есть там, где пользователь сторона сделки.
 *
 * Список ограничен одной страницей `MAX_PAGE_SIZE` заказов: фильтр — это
 * удобство, а не право доступа, и подгрузка по мере прокрутки ради него
 * не окупается. Заказ, не попавший в варианты, всё равно фильтруется — через
 * адрес (`withSelectedOrder`).
 *
 * Отбор идёт на сервере, а не по полученной странице: у компании предложений
 * может быть больше страницы, и отсев после пагинации оставлял бы фильтр
 * пустым при полном списке документов.
 */
async function loadOrderOptions(viewer: Role) {
  if (viewer === Role.CLIENT) {
    const page = await serverApi.get<Paginated<OrderListItem>>("/orders", {
      query: { pageSize: MAX_PAGE_SIZE },
    });

    return toOrderOptions(page.items);
  }

  // `executor=true` — предложения, которыми компания стала исполнителем.
  // Непринятое предложение заказа компании не делает: файлов по нему
  // в разделе нет, и вариант фильтра дал бы всегда пустой список.
  const page = await serverApi.get<Paginated<CompanyOfferItem>>("/company/offers", {
    query: { pageSize: MAX_PAGE_SIZE, executor: "true" },
  });

  return toOrderOptions(page.items.map((offer) => offer.order));
}

export async function OrderFilter({
  filter,
  viewer,
}: {
  filter: DocumentsFilter;
  viewer: Role;
}) {
  const options = withSelectedOrder(await loadOrderOptions(viewer), filter.orderId);

  // Заказов нет — нечего и фильтровать: поле с единственным пунктом
  // «Все заказы» только занимало бы место.
  if (options.length === 0) return null;

  return (
    <OrderSelect options={options} value={filter.orderId} ownerType={filter.ownerType} />
  );
}

/** Заглушка на время запроса: без неё вкладки прыгали бы при появлении поля. */
export function OrderFilterSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-sm">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
