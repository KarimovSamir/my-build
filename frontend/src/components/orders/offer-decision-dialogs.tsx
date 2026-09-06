"use client";

import { Check, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { OfferDto, OrderDetail } from "@/lib/types";

import { useOrderSync } from "@/components/orders/order-live";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Решение клиента по предложению: принять или отклонить (ТЗ §4).
 *
 * Два диалога в одном файле — это две половины одной развилки, ровно как
 * `ConfirmOrderDto` и `DisputeOrderDto` на backend. Оба спрашивают
 * подтверждение: принятие запускает работу и разом отклоняет остальные
 * предложения, отклонение стирает чужую цену с экрана клиента.
 *
 * Кнопки показываются только там, где переход разрешён (`resolveClientActions`),
 * но отказ всё равно возможен: пока страница открыта, компания могла отозвать
 * предложение. Поэтому ответ 409 показывается как есть.
 */

export function AcceptOfferDialog({
  orderId,
  offer,
  rivals,
}: {
  orderId: string;
  offer: OfferDto;
  /** Сколько других предложений уйдёт в «Не выбрано» вместе с этим решением. */
  rivals: number;
}) {
  return (
    <OfferDecision
      // Принятие возвращает заказ целиком — карточка перерисовывается им сразу.
      request={() =>
        browserApi.post<OrderDetail>(`/orders/${orderId}/accept-offer/${offer.id}`)
      }
      trigger={
        <Button>
          <Check className="size-4" aria-hidden />
          Принять
        </Button>
      }
      // Название компании в кавычки не берётся: у большинства они уже
      // в самом названии — «ООО «Ремонт Плюс»» читается как опечатка.
      title={`Принять предложение ${offer.companyName}?`}
      description={
        <>
          Заказ перейдёт в работу. Цена сделки — {formatMoney(offer.proposedPrice)},
          срок — {formatDate(offer.proposedDeadline)}.
          {rivals > 0
            ? ` Остальные предложения (${rivals}) получат статус «Не выбрано».`
            : null}
        </>
      }
      submitLabel="Принять предложение"
      pendingLabel="Принимаем…"
      successTitle="Предложение принято"
      successText={`${offer.companyName} приступает к работе`}
      errorTitle="Не удалось принять предложение"
    />
  );
}

export function RejectOfferDialog({ offer }: { offer: OfferDto }) {
  return (
    <OfferDecision
      // Ответ — само предложение, а не заказ: статус заказа мог смениться
      // вместе с ним, поэтому карточку перечитываем.
      request={async () => {
        await browserApi.post(`/offers/${offer.id}/reject`);
        return null;
      }}
      trigger={
        <Button variant="outline">
          <X className="size-4" aria-hidden />
          Отклонить
        </Button>
      }
      title={`Отклонить предложение ${offer.companyName}?`}
      description="Компания получит уведомление. Если других предложений нет, заказ вернётся к поиску исполнителя — и та же компания сможет прислать новое предложение."
      submitLabel="Отклонить"
      pendingLabel="Отклоняем…"
      successTitle="Предложение отклонено"
      successText={`${offer.companyName} больше не участвует в выборе`}
      errorTitle="Не удалось отклонить предложение"
    />
  );
}

/** Общая обвязка обоих решений: подтверждение, запрос, тост, обновление. */
function OfferDecision({
  request,
  trigger,
  title,
  description,
  submitLabel,
  pendingLabel,
  successTitle,
  successText,
  errorTitle,
}: {
  /** Свежий заказ из ответа, если маршрут его возвращает; иначе `null`. */
  request: () => Promise<OrderDetail | null>;
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  submitLabel: string;
  pendingLabel: string;
  successTitle: string;
  successText: string;
  errorTitle: string;
}) {
  const sync = useOrderSync();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    try {
      const order = await request();

      toast.success(successTitle, { description: successText });

      // Заказ из ответа — уже настоящий, а не предсказанный: показываем его
      // сразу. Если маршрут его не вернул, идём за ним сами.
      if (order) sync.apply(order);
      else sync.reload();
    } catch (error) {
      toast.error(errorTitle, {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
      // После отказа — тоже: кнопки должны сойтись с тем, что на сервере
      // уже произошло (например, предложение успели отозвать).
      sync.reload();
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Отмена
            </Button>
          </DialogClose>
          <Button disabled={pending} onClick={handleClick}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
