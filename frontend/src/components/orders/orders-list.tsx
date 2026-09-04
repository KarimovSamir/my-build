import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  DEFAULT_PAGE_SIZE,
  formatOrderNumber,
  type OrderListItem,
  type Paginated,
} from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
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
import { formatDate, formatMoney } from "@/lib/format";
import { isEmptyFilter, ordersHref, type OrdersFilter } from "@/lib/orders-filter";
import { cn } from "@/lib/utils";

/**
 * Список заказов клиента (ТЗ §7, раздел «Все заказы»).
 *
 * Данные берутся на сервере: страница приезжает уже заполненной, а фильтр
 * читается из адреса. Компонент асинхронный и живёт под `<Suspense>` — пока
 * идёт запрос, на его месте показывается скелет, а шапка с поиском и вкладками
 * остаётся на экране и не теряет фокус ввода.
 *
 * На десктопе — таблица, на мобильном — карточки (ТЗ §7, «Адаптивность»).
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
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <HeadCell>Заказ</HeadCell>
          <HeadCell>Подрядчик</HeadCell>
          <HeadCell>Статус</HeadCell>
          <HeadCell>Бюджет</HeadCell>
          <HeadCell>Срок</HeadCell>
          <HeadCell className="w-10">
            <span className="sr-only">Открыть</span>
          </HeadCell>
        </TableRow>
      </TableHeader>

      <TableBody>
        {items.map((order) => (
          // relative + растянутая ссылка в первой ячейке: по ТЗ §7 кликается
          // вся строка, а вкладывать <a> вокруг <tr> нельзя.
          <TableRow key={order.id} className="relative">
            <TableCell className="px-4 py-3">
              <Link
                href={`/orders/${order.id}`}
                className="focus-visible:ring-ring/50 font-medium after:absolute after:inset-0 focus-visible:ring-3 focus-visible:outline-none"
              >
                {order.title}
              </Link>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {formatOrderNumber(order.orderNumber)}
              </p>
            </TableCell>
            <TableCell className="px-4 py-3">
              <Contractor name={order.contractorName} />
            </TableCell>
            <TableCell className="px-4 py-3">
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Money order={order} />
            </TableCell>
            <TableCell className="text-muted-foreground px-4 py-3">
              {order.deadline ? formatDate(order.deadline) : "—"}
            </TableCell>
            <TableCell className="px-4 py-3">
              <ChevronRight className="text-muted-foreground size-4" aria-hidden />
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
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex flex-col gap-3 px-4 py-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{order.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {formatOrderNumber(order.orderNumber)}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" aria-hidden />
        </div>

        <OrderStatusBadge status={order.status} className="self-start" />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field label="Подрядчик">
            <Contractor name={order.contractorName} />
          </Field>
          <Field label="Срок">
            <span className={order.deadline ? undefined : "text-muted-foreground"}>
              {order.deadline ? formatDate(order.deadline) : "—"}
            </span>
          </Field>
          <Field label="Бюджет">
            <Money order={order} />
          </Field>
        </dl>
      </Link>
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function HeadCell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <TableHead
      className={cn(
        "text-muted-foreground px-4 py-2.5 text-xs font-medium tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </TableHead>
  );
}

/** Подрядчик — компания принятого предложения; до этого его нет. */
function Contractor({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-muted-foreground">Не назначен</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
        aria-hidden
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
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
    return <span className="text-muted-foreground">Не указан</span>;
  }

  return (
    <span className="flex flex-col">
      <span className="font-medium">{formatMoney(value)}</span>
      <span className="text-muted-foreground text-xs">{caption}</span>
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

