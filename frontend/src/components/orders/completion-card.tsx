import { formatOrderNumber, type OrderDetail } from "@/lib/types";

import {
  ConfirmWorkDialog,
  DisputeWorkDialog,
} from "@/components/orders/completion-dialogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { completionHint } from "@/lib/completion-view";
import type { OrderClientActions } from "@/lib/order-actions";

/**
 * Приёмка работы (ТЗ §4).
 *
 * Блок появляется, когда работа сдана хотя бы раз, и живёт до конца заказа:
 * комментарий к доработке и комментарий при приёмке остаются на странице
 * и после завершения — это переписка сторон о сдаче, а не всплывающее
 * сообщение.
 *
 * Кнопки собирает `resolveClientActions` по той же таблице переходов, что
 * и сервер: у компании их не будет никогда, у клиента — только в статусе,
 * где решение вообще возможно.
 */
export function CompletionCard({
  order,
  actions,
  isOwner,
}: {
  order: OrderDetail;
  actions: OrderClientActions;
  isOwner: boolean;
}) {
  const hint = completionHint(order.status, isOwner);

  if (!hint && !order.correctionComment && !order.clientCompletionComment) {
    return null;
  }

  const orderLabel = formatOrderNumber(order.orderNumber);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Приёмка работы</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {hint ? <p className="text-sm">{hint}</p> : null}

        {order.correctionComment ? (
          <Note label="Отправлено на доработку">{order.correctionComment}</Note>
        ) : null}

        {order.clientCompletionComment ? (
          <Note label="Комментарий клиента при приёмке">
            {order.clientCompletionComment}
          </Note>
        ) : null}

        {actions.canConfirmWork || actions.canDisputeWork ? (
          <div className="flex flex-wrap gap-2">
            {actions.canConfirmWork ? (
              <ConfirmWorkDialog orderId={order.id} orderLabel={orderLabel} />
            ) : null}
            {actions.canDisputeWork ? (
              <DisputeWorkDialog orderId={order.id} orderLabel={orderLabel} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Note({ label, children }: { label: string; children: string }) {
  return (
    <div className="border-border bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-line">{children}</p>
    </div>
  );
}
