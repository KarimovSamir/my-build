import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

import type { OfferDto } from "@/lib/types";

import {
  AcceptOfferDialog,
  RejectOfferDialog,
} from "@/components/orders/offer-decision-dialogs";
import { OfferStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { OrderClientActions } from "@/lib/order-actions";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Предложения компаний
          {actions.decisions.length > 0 ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {actions.decisions.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {actions.decisions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Предложений пока нет. Компании видят заказ в ленте и присылают свою
            цену и срок — вы получите уведомление.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {actions.decisions.map(({ offer, canAccept, canReject }) => (
              <li key={offer.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">
                <OfferHead offer={offer} />
                <OfferTerms offer={offer} />

                {offer.comment ? (
                  <p className="text-sm whitespace-pre-line">{offer.comment}</p>
                ) : null}

                {canAccept || canReject ? (
                  <div className="flex flex-wrap gap-2">
                    {canAccept ? (
                      <AcceptOfferDialog
                        orderId={orderId}
                        offer={offer}
                        rivals={actions.decisions.length - 1}
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
      <CardHeader>
        <CardTitle>Принятое предложение</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <OfferHead offer={offer} withStatus />
        <OfferTerms offer={offer} />

        {offer.comment ? (
          <p className="text-sm whitespace-pre-line">{offer.comment}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OfferHead({
  offer,
  withStatus = false,
}: {
  offer: OfferDto;
  /** Статус нужен только у принятого: у ждущих выбора он у всех одинаковый. */
  withStatus?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
          <Building2 className="text-muted-foreground size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{offer.companyName}</span>
          <span className="text-muted-foreground text-xs">
            Предложение от {formatDate(offer.createdAt)}
          </span>
        </span>
      </div>

      {withStatus ? <OfferStatusBadge status={offer.status} /> : null}
    </div>
  );
}

function OfferTerms({ offer }: { offer: OfferDto }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <Term label="Цена">
        <span className="font-medium">{formatMoney(offer.proposedPrice)}</span>
      </Term>
      <Term label="Срок выполнения">{formatDate(offer.proposedDeadline)}</Term>
    </dl>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
