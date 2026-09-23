import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import {
  DEFAULT_PAGE_SIZE,
  formatOrderNumber,
  objectTypeLabels,
  type OrderListItem,
  type Paginated,
} from "@/lib/types";

import { EmptyCard, ListField, OutOfRange, PaginationBar } from "@/components/list-parts";
import { OrderStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { serverApi } from "@/lib/api.server";
import { companyInitial, formatDate, formatMoney } from "@/lib/format";
import { isEmptyFilter, ordersHref, type OrdersFilter } from "@/lib/orders-filter";

/**
 * Список заказов клиента (ТЗ §7, раздел «Все заказы»).
 *
 * Данные берутся на сервере: страница приезжает уже заполненной, а фильтр
 * читается из адреса. Компонент асинхронный и живёт под `<Suspense>` — пока
 * идёт запрос, на его месте показывается скелет, а шапка с поиском и вкладками
 * остаётся на экране и не теряет фокус ввода.
 *
 * На десктопе — таблица, на мобильном — карточки (ТЗ §7, «Адаптивность»).
 * Это эталон списка: остальные разделы строятся по нему.
 */
export async function OrdersList({ filter }: { filter: OrdersFilter }) {
  const page = await serverApi.get<Paginated<OrderListItem>>("/orders", {
    query: {
      status: filter.status,
      q: filter.q,
      page: filter.page,
      // Размер страницы задаётся явно, а не берётся из умолчания backend:
      // иначе смена умолчания на сервере молча меняла бы вид экрана.
      pageSize: DEFAULT_PAGE_SIZE,
    },
  });

  if (page.total === 0) {
    return <EmptyState filter={filter} />;
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={ordersHref({ status: filter.status, q: filter.q })}
          label="На этой странице заказов нет"
        />
      ) : (
        <>
          <div className="hidden md:block">
            <OrdersTable items={page.items} />
          </div>
          <ul className="divide-border divide-y md:hidden">
            {page.items.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        </>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => ordersHref({ ...filter, page: next })}
      />
    </Card>
  );
}

function OrdersTable({ items }: { items: OrderListItem[] }) {
  return (
    <Table>
      <TableHeader>
        {/*
          Ширины колонок не заданы числами: `w-full` у первой отдаёт ей весь
          остаток, а остальные сжимаются по содержимому. Фиксированные значения
          из макета резали название заказа на две строки — самый длинный статус
          («Ожидание подтверждения выполнения») сам занимает почти 300 px.
        */}
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-full px-5">Заказ</TableHead>
          <TableHead className="px-5">Подрядчик</TableHead>
          <TableHead className="px-5">Статус</TableHead>
          <TableHead className="px-5 text-right">Бюджет</TableHead>
          <TableHead className="px-5 text-right">Срок</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {items.map((order) => (
          // relative + растянутая ссылка в первой ячейке: по ТЗ §7 кликается
          // вся строка, а вкладывать <a> вокруг <tr> нельзя.
          <TableRow key={order.id} className="relative">
            <TableCell className="px-5 py-4 whitespace-normal">
              <Link
                href={`/orders/${order.id}`}
                className="focus-visible:ring-ring/50 font-heading text-base font-semibold after:absolute after:inset-0 focus-visible:ring-3 focus-visible:outline-none"
              >
                {order.title}
              </Link>
              <p className="text-muted-foreground font-mono mt-1 text-xs">
                {formatOrderNumber(order.orderNumber)} · {objectTypeLabels[order.objectType]}
              </p>
            </TableCell>
            <TableCell className="px-5 py-4">
              <Contractor name={order.contractorName} />
            </TableCell>
            <TableCell className="px-5 py-4">
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="px-5 py-4 text-right">
              <Money order={order} />
            </TableCell>
            <TableCell className="text-secondary-foreground font-mono px-5 py-4 text-right text-sm">
              {order.deadline ? formatDate(order.deadline) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrderCard({ order }: { order: OrderListItem }) {
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="hover:bg-brand-surface focus-visible:ring-ring/50 flex flex-col gap-3.5 px-5 py-5 transition-colors focus-visible:ring-3 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Название переносится: обрезанное «Проект перепланировки кварти…»
                на узком экране теряло ровно то, чем заказы различаются. */}
            <p className="font-heading text-base font-semibold text-pretty">{order.title}</p>
            <p className="text-muted-foreground font-mono mt-1 text-xs">
              {formatOrderNumber(order.orderNumber)} · {objectTypeLabels[order.objectType]}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" aria-hidden />
        </div>

        <OrderStatusBadge status={order.status} className="self-start" />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <ListField label="Подрядчик">
            <Contractor name={order.contractorName} />
          </ListField>
          <ListField label="Срок">
            <span
              className={
                order.deadline ? "font-mono text-sm" : "text-muted-foreground"
              }
            >
              {order.deadline ? formatDate(order.deadline) : "—"}
            </span>
          </ListField>
          <ListField label="Бюджет">
            <Money order={order} />
          </ListField>
        </dl>
      </Link>
    </li>
  );
}

/** Подрядчик — компания принятого предложения; до этого его нет. */
function Contractor({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-muted-foreground text-sm">Не назначен</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="bg-secondary text-secondary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        aria-hidden
      >
        {companyInitial(name)}
      </span>
      {/* В таблице ячейка и так не переносит строк, а в мобильной карточке
          название обязано переноситься: у всех подрядчиков оно начинается
          с «ООО «…», и обрезка оставляла от него одну правовую форму. */}
      <span className="min-w-0 text-sm">{name}</span>
    </span>
  );
}

/**
 * Деньги в строке заказа.
 *
 * `clientBudget` — ожидание клиента, `price` — цена состоявшейся сделки; ТЗ §3
 * запрещает их смешивать. Поэтому в ячейке всегда подписано, какое из двух
 * чисел показано, а не просто «сумма».
 */
function Money({ order }: { order: OrderListItem }) {
  const [value, caption] = order.price
    ? [order.price, "цена сделки"]
    : [order.clientBudget, "бюджет клиента"];

  if (!value) {
    return <span className="text-muted-foreground text-sm">Не указан</span>;
  }

  return (
    <span className="flex flex-col">
      <span className="font-mono text-[0.9375rem] font-medium whitespace-nowrap">
        {formatMoney(value)}
      </span>
      <span className="text-muted-foreground mt-0.5 text-xs">{caption}</span>
    </span>
  );
}

/** Заказов нет вовсе — или нет по текущему фильтру. Это разные экраны. */
function EmptyState({ filter }: { filter: OrdersFilter }) {
  if (isEmptyFilter(filter)) {
    return (
      <EmptyCard
        title="Заказов пока нет"
        description="Опишите проект — и компании пришлют предложения с ценой и сроком."
      >
        <Button asChild>
          <Link href="/orders/new">
            <Plus className="size-4" />
            Создать заказ
          </Link>
        </Button>
      </EmptyCard>
    );
  }

  return (
    <EmptyCard
      title="Ничего не найдено"
      description="Попробуйте изменить запрос или выбрать другую вкладку."
    >
      <Button variant="outline" asChild>
        <Link href={ordersHref()}>Сбросить фильтры</Link>
      </Button>
    </EmptyCard>
  );
}
