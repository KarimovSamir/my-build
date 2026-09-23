import { formatOrderNumber, type OrderDetail } from "@/lib/types";

import {
  AddWorkFilesDialog,
  SubmitWorkDialog,
  VerifyAreaDialog,
} from "@/components/orders/work-dialogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderCompanyActions } from "@/lib/order-actions";
import type { SubmissionsView } from "@/lib/submissions";
import { countCompanyFiles } from "@/lib/work-form";
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
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Ваша работа по заказу</CardTitle>
        {/* Номер сдачи служебный, поэтому моноширинным: он нужен, чтобы
            сверяться с историей сдач ниже. */}
        <span className="text-muted-foreground font-mono text-xs">
          сдача №{nextRound} · {submissions.open ? "открыта" : "новая"}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {hint ? (
          // В тёмной теме `--tone-yellow` — насыщенный янтарь: на бейдже
          // статуса он читается, а плашкой во всю ширину перекрикивает
          // и заголовок, и кнопку. Отсюда приглушение только в тёмной.
          // Текст — основным цветом, а не жёлтым тона: в светлой теме тот
          // на своей плашке даёт 4.4 при норме 4.5 для обычного текста.
          <p className="bg-tone-yellow text-foreground rounded-lg px-4 py-3.5 text-sm leading-relaxed dark:bg-tone-yellow/25">
            {hint}
          </p>
        ) : null}

        {hasActions ? (
          <div className="flex flex-wrap gap-2.5">
            {actions.canAddFiles ? (
              <AddWorkFilesDialog
                orderId={order.id}
                round={nextRound}
                filesBefore={countCompanyFiles(order)}
                takenNames={(submissions.open?.files ?? []).map(
                  (file) => file.originalName,
                )}
                // Исполнитель — сторона сделки, поэтому число ему приходит
                // всегда; `?? 0` только чтобы не тащить сюда `null`.
                usedBytes={order.filesSizeBytes ?? 0}
              />
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
