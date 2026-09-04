import Link from "next/link";

import { formatOrderNumber, isPendingOffer, type OfferDto, type OrderDetail } from "@/lib/types";

import { OfferDialog } from "@/components/offers/offer-dialog";
import { WithdrawOfferDialog } from "@/components/offers/withdraw-offer-dialog";
import { OfferStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { offerHint } from "@/lib/offer-view";

/**
 * Своё предложение глазами компании (ТЗ §4.1).
 *
 * Компания видит на заказе только его — чужих цен ей не показывают никогда,
 * и отбирает их backend, а не разметка. Пока предложение ждёт выбора клиента,
 * здесь те же действия, что и в разделе «Мои предложения»: изменить или
 * отозвать. Дальше остаётся подсказка о том, что происходит с заказом.
 */
export function CompanyOfferCard({
  order,
  offer,
  isExecutor,
}: {
  order: OrderDetail;
  offer: OfferDto;
  /**
   * Исполнителю подсказка не нужна: что происходит с работой, ему в тех же
   * словах говорят блоки «Ваша работа по заказу» и «Приёмка работы». Три
   * одинаковые фразы подряд читаются как сбой, а не как объяснение.
   */
  isExecutor: boolean;
}) {
  const hint = isExecutor ? null : offerHint(offer.status, order.id);
  const orderLabel = formatOrderNumber(order.orderNumber);

  // Ссылка «Открыть заказ» ведёт на страницу, которая сейчас открыта:
  // в разделе «Мои предложения» она нужна, здесь — нет.
  const link = hint?.link?.href === `/orders/${order.id}` ? undefined : hint?.link;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          Ваше предложение
          <OfferStatusBadge status={offer.status} />
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Ваша цена</dt>
            <dd className="mt-0.5 font-medium">{formatMoney(offer.proposedPrice)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Срок выполнения</dt>
            <dd className="mt-0.5">{formatDate(offer.proposedDeadline)}</dd>
          </div>
        </dl>

        {offer.comment ? (
          <p className="text-sm whitespace-pre-line">{offer.comment}</p>
        ) : null}

        {hint ? (
          <p className="text-muted-foreground text-sm">
            {hint.text}
            {link ? (
              <>
                {" "}
                <Link href={link.href} className="text-primary hover:underline">
                  {link.label}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        {isPendingOffer(offer.status) ? (
          <div className="flex flex-wrap gap-2">
            <OfferDialog order={order} offer={offer} />
            <WithdrawOfferDialog offerId={offer.id} orderLabel={orderLabel} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
