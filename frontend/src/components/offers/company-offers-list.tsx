import Link from "next/link";
import type { ReactNode } from "react";

import {
  DEFAULT_PAGE_SIZE,
  formatOrderNumber,
  isPendingOffer,
  offerStatusLabels,
  type CompanyOfferItem,
  type Paginated,
} from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
import { OfferDialog } from "@/components/offers/offer-dialog";
import { WithdrawOfferDialog } from "@/components/offers/withdraw-offer-dialog";
import { OfferStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api.server";
import { formatDate, formatMoney } from "@/lib/format";
import { offerHint } from "@/lib/offer-view";
import { companyOffersHref, type CompanyOffersFilter } from "@/lib/offers-filter";

/**
 * Мои предложения (ТЗ §5, §7).
 *
 * Изменить и отозвать можно только предложение, которое ещё ждёт выбора
 * клиента, — у остальных вместо кнопок подсказка о том, что происходит
 * с заказом (`offerHint`).
 */
export async function CompanyOffersList({ filter }: { filter: CompanyOffersFilter }) {
  const page = await serverApi.get<Paginated<CompanyOfferItem>>("/company/offers", {
    query: {
      status: filter.status,
      page: filter.page,
      // Размер страницы задаётся явно, а не берётся из умолчания backend:
      // иначе смена умолчания на сервере молча меняла бы вид экрана.
      pageSize: DEFAULT_PAGE_SIZE,
    },
  });

  if (page.total === 0) {
    return filter.status === null ? (
      <EmptyCard
        title="Предложений пока нет"
        description="Найдите заказ в ленте и предложите свою цену и срок."
      >
        <Button asChild>
          <Link href="/available">К ленте заказов</Link>
        </Button>
      </EmptyCard>
    ) : (
      <EmptyCard
        title={`Нет предложений в статусе «${offerStatusLabels[filter.status]}»`}
        description="Выберите другую вкладку, чтобы увидеть остальные предложения."
      >
        <Button variant="outline" asChild>
          <Link href={companyOffersHref()}>Показать все</Link>
        </Button>
      </EmptyCard>
    );
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={companyOffersHref({ status: filter.status })}
          label="На этой странице предложений нет"
        />
      ) : (
        <ul className="divide-border divide-y">
          {page.items.map((offer) => (
            <CompanyOfferRow key={offer.id} offer={offer} />
          ))}
        </ul>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => companyOffersHref({ ...filter, page: next })}
      />
    </Card>
  );
}

function CompanyOfferRow({ offer }: { offer: CompanyOfferItem }) {
  const { order } = offer;
  const orderLabel = formatOrderNumber(order.orderNumber);
  const hint = offerHint(offer.status, order.id);

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
            {orderLabel} · обновлено {formatDate(offer.updatedAt)}
          </p>
        </div>

        <OfferStatusBadge status={offer.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Field label="Ваша цена">
          <span className="font-medium">{formatMoney(offer.proposedPrice)}</span>
        </Field>
        <Field label="Ваш срок">{formatDate(offer.proposedDeadline)}</Field>
        <Field label="Бюджет клиента">
          {order.clientBudget ? (
            formatMoney(order.clientBudget)
          ) : (
            <span className="text-muted-foreground">Не указан</span>
          )}
        </Field>
      </dl>

      {offer.comment ? (
        <p className="text-muted-foreground text-sm whitespace-pre-line">
          {offer.comment}
        </p>
      ) : null}

      {isPendingOffer(offer.status) ? (
        <div className="flex flex-wrap gap-2">
          <OfferDialog
            order={{ id: order.id, orderNumber: order.orderNumber, title: order.title }}
            offer={offer}
            variant="outline"
          />
          <WithdrawOfferDialog offerId={offer.id} orderLabel={orderLabel} />
        </div>
      ) : hint ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {hint.text}
          {hint.link ? (
            <Link
              href={hint.link.href}
              className="text-primary underline-offset-4 hover:underline"
            >
              {hint.link.label}
            </Link>
          ) : null}
        </p>
      ) : null}
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
