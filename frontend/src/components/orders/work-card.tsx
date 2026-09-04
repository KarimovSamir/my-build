import { formatOrderNumber, type OrderDetail } from "@/lib/types";

import {
  AddWorkFilesDialog,
  SubmitWorkDialog,
  VerifyAreaDialog,
} from "@/components/orders/work-dialogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderCompanyActions } from "@/lib/order-actions";
import type { SubmissionsView } from "@/lib/submissions";
import { workHint } from "@/lib/work-view";

/**
 * Работа глазами компании-исполнителя (ТЗ §4.1).
 *
 * Здесь всё, что компания делает с заказом после принятия предложения: файлы
 * сдачи, сама сдача и уточнение площади. Клиент этот блок не видит никогда —
 * `resolveCompanyActions` отдаёт ему пустой набор.
 *
 * Состав кнопок считает та же таблица переходов, что и сервер, поэтому кнопки
 * «Сдать работу» нет, пока в текущей сдаче нет ни одного файла: сервер на такую
 * сдачу отвечает 409.
 */
export function WorkCard({
  order,
  actions,
  submissions,
}: {
  order: OrderDetail;
  actions: OrderCompanyActions;
  submissions: SubmissionsView;
}) {
  if (!actions.isExecutor) return null;

  const hint = workHint(order.status, (submissions.open?.files.length ?? 0) > 0);

  // Номер сдачи, в которую уйдут файлы: открытая, если она есть, иначе
  // следующая. Ту же арифметику делает сервер под блокировкой заказа —
  // здесь она нужна, только чтобы написать номер в диалоге.
  const nextRound = submissions.open?.round ?? (submissions.latest?.round ?? 0) + 1;

  const hasActions = actions.canAddFiles || actions.canSubmitWork || actions.canVerifyArea;

  if (!hint && !hasActions) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ваша работа по заказу</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {hint ? <p className="text-sm">{hint}</p> : null}

        {hasActions ? (
          <div className="flex flex-wrap gap-2">
            {actions.canAddFiles ? (
              <AddWorkFilesDialog orderId={order.id} round={nextRound} />
            ) : null}

            {actions.canSubmitWork ? (
              <SubmitWorkDialog
                orderId={order.id}
                orderLabel={formatOrderNumber(order.orderNumber)}
                round={nextRound}
              />
            ) : null}

            {actions.canVerifyArea ? (
              <VerifyAreaDialog
                orderId={order.id}
                squareMeters={order.squareMeters}
                verifiedSquareMeters={order.verifiedSquareMeters}
              />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
