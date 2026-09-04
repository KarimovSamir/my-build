import Link from "next/link";

import {
  DEFAULT_PAGE_SIZE,
  formatOrderNumber,
  objectTypeLabels,
  orderCategoryLabels,
  type OrderListItem,
  type Paginated,
} from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
import { OfferDialog } from "@/components/offers/offer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api.server";
import {
  availableHref,
  isEmptyAvailableFilter,
  type AvailableFilter,
} from "@/lib/available-filter";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Лента доступных заказов (ТЗ §4.1, §7).
 *
 * Сюда попадают заказы, которые ещё ищут исполнителя и по которым у компании
 * нет действующего предложения, — выборку считает backend. Поэтому цены сделки,
 * срока и подрядчика в строке нет: чужого прогресса компания не видит, а из
 * денег ей важен ориентир клиента.
 *
 * Не таблица, а карточки: у каждой строки своя кнопка действия, а бюджет —
 * то, ради чего компания сюда и смотрит.
 */
export async function AvailableOrdersList({ filter }: { filter: AvailableFilter }) {
  const page = await serverApi.get<Paginated<OrderListItem>>("/company/orders/available", {
    query: {
      q: filter.q,
      page: filter.page,
      // Размер страницы задаётся явно, а не берётся из умолчания backend:
      // иначе смена умолчания на сервере молча меняла бы вид экрана.
      pageSize: DEFAULT_PAGE_SIZE,
    },
  });

  if (page.total === 0) {
    return isEmptyAvailableFilter(filter) ? (
      <EmptyCard
        title="Свободных заказов пока нет"
        description="Здесь появятся заказы, по которым клиенты ищут исполнителя."
      >
        <Button variant="outline" asChild>
          <Link href="/offers">Мои предложения</Link>
        </Button>
      </EmptyCard>
    ) : (
      <EmptyCard
        title="Ничего не найдено"
        description="Попробуйте изменить запрос — искать можно по номеру и названию заказа."
      >
        <Button variant="outline" asChild>
          <Link href={availableHref()}>Сбросить поиск</Link>
        </Button>
      </EmptyCard>
    );
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={availableHref({ q: filter.q })}
          label="На этой странице заказов нет"
        />
      ) : (
        <ul className="divide-border divide-y">
          {page.items.map((order) => (
            <AvailableOrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => availableHref({ ...filter, page: next })}
      />
    </Card>
  );
}

function AvailableOrderRow({ order }: { order: OrderListItem }) {
  return (
    <li className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/orders/${order.id}`}
            className="focus-visible:ring-ring/50 font-medium hover:underline focus-visible:ring-3 focus-visible:outline-none"
          >
            {order.title}
          </Link>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatOrderNumber(order.orderNumber)} · опубликован{" "}
            {formatDate(order.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{orderCategoryLabels[order.category]}</Badge>
          <Badge variant="outline">{objectTypeLabels[order.objectType]}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Бюджет клиента</p>
          <p className="mt-0.5 font-medium">
            {order.clientBudget ? (
              formatMoney(order.clientBudget)
            ) : (
              <span className="text-muted-foreground font-normal">Не указан</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/orders/${order.id}`}>Подробнее</Link>
          </Button>
          <OfferDialog
            order={{ id: order.id, orderNumber: order.orderNumber, title: order.title }}
          />
        </div>
      </div>
    </li>
  );
}
