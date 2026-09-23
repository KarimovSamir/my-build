import type { OfferDto } from "@/lib/types";

import {
  AcceptOfferDialog,
  RejectOfferDialog,
} from "@/components/orders/offer-decision-dialogs";
import { OfferStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { companyInitial, formatDate, formatMoney } from "@/lib/format";
import { offerDate } from "@/lib/offer-view";
import type { OrderClientActions } from "@/lib/order-actions";
import { pluralRu } from "@/lib/plural";

const COMPANY_FORMS = ["компания", "компании", "компаний"] as const;

/**
 * Предложения компаний глазами клиента (ТЗ §4.1).
 *
 * Пока идёт выбор — все активные предложения списком с ценой, сроком
 * и комментарием: именно по ним клиент и решает. После выбора список
 * схлопывается в одно предложение исполнителя, остальные ушли в «Не выбрано»
 * и клиенту больше не нужны.
 *
 * Компания сюда не попадает: чужих цен она не видит никогда, а своё
 * предложение показывает отдельный блок.
 */
export function OrderOffersCard({
  orderId,
  actions,
}: {
  orderId: string;
  actions: OrderClientActions;
}) {
  if (actions.executorOffer) {
    return <ExecutorCard offer={actions.executorOffer} />;
  }

  const count = actions.decisions.length;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Предложения</CardTitle>
        {count > 0 ? (
          <span className="text-muted-foreground text-sm">
            {count} {pluralRu(count, COMPANY_FORMS)} · выбрать можно одну
          </span>
        ) : null}
      </CardHeader>

      <CardContent>
        {count === 0 ? (
          <p className="text-muted-foreground text-sm">
            Предложений пока нет. Компании видят заказ в ленте и присылают свою
            цену и срок — вы получите уведомление.
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {actions.decisions.map(({ offer, canAccept, canReject }) => (
              <li key={offer.id} className="rounded-xl border px-5 py-5">
                <OfferHead offer={offer} />

                {offer.comment ? (
                  <p className="text-secondary-foreground mt-3.5 text-sm leading-relaxed whitespace-pre-line">
                    {offer.comment}
                  </p>
                ) : null}

                {canAccept || canReject ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    {canAccept ? (
                      <AcceptOfferDialog
                        orderId={orderId}
                        offer={offer}
                        rivals={count - 1}
                      />
                    ) : null}
                    {canReject ? <RejectOfferDialog offer={offer} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Предложение, по которому заказ исполняется: выбор уже сделан. */
function ExecutorCard({ offer }: { offer: OfferDto }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Принятое предложение</CardTitle>
        <OfferStatusBadge status={offer.status} />
      </CardHeader>

      <CardContent>
        <OfferHead offer={offer} />

        {offer.comment ? (
          <p className="text-secondary-foreground mt-3.5 text-sm leading-relaxed whitespace-pre-line">
            {offer.comment}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Шапка предложения: кто предложил — слева, за сколько и к какому сроку —
 * справа. Цена крупная и моноширинная: по ней предложения и сравнивают.
 */
function OfferHead({ offer }: { offer: OfferDto }) {
  // Изменённое предложение подписывается датой изменения: цена и срок
  // в строке уже новые, а `createdAt` относился бы к прежним условиям.
  const date = offerDate(offer);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="bg-secondary text-secondary-foreground font-heading flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold"
          aria-hidden
        >
          {companyInitial(offer.companyName)}
        </span>
        <div className="min-w-0">
          <p className="font-heading text-[1.0625rem] font-semibold">
            {offer.companyName}
          </p>
          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
            {date.label} {formatDate(date.iso)}
          </p>
        </div>
      </div>

      {/* Вправо — только когда цена стоит в одной строке с компанией. На узком
          экране блок уходит на свою строку, и выравнивание вправо внутри него
          сдвигало цену относительно более длинной строки срока. */}
      <div className="sm:text-right">
        <p className="font-mono text-xl font-medium whitespace-nowrap">
          {formatMoney(offer.proposedPrice)}
        </p>
        <p className="text-muted-foreground mt-0.5 font-mono text-xs whitespace-nowrap">
          срок до {formatDate(offer.proposedDeadline)}
        </p>
      </div>
    </div>
  );
}
