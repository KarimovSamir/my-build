"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

/**
 * Отзыв предложения с подтверждением (ТЗ §5).
 *
 * Кнопка показывается только у предложения, которое ещё ждёт выбора клиента
 * (`isPendingOffer`) — то же предусловие проверяет state-машина. Отказ всё
 * равно возможен: пока страница открыта, клиент мог принять предложение,
 * поэтому ответ 409 показывается пользователю как есть.
 *
 * Отзыв не удаляет предложение: заказ снова появляется в ленте, и по нему
 * можно прислать новое (ТЗ §4.1).
 */
export function WithdrawOfferDialog({
  offerId,
  orderLabel,
}: {
  offerId: string;
  /** Как заказ называется в вопросе: «Отозвать предложение по ORD-24?» */
  orderLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleWithdraw() {
    setPending(true);

    try {
      await browserApi.post(`/offers/${offerId}/withdraw`);

      toast.success("Предложение отозвано", {
        description: `${orderLabel} снова доступен в ленте — можно прислать новое предложение`,
      });

      setOpen(false);
    } catch (error) {
      toast.error("Не удалось отозвать предложение", {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
      setOpen(false);
    } finally {
      setPending(false);
      // Список рендерится на сервере. Перечитываем в обоих случаях: после
      // успеха — чтобы статус сменился, после отказа — чтобы кнопка исчезла,
      // если отзывать уже нечего.
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 className="size-4" aria-hidden />
          Отозвать
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отозвать предложение по {orderLabel}?</DialogTitle>
          <DialogDescription>
            Клиент перестанет видеть вашу цену и срок. Заказ вернётся в ленту
            доступных, и вы сможете прислать новое предложение.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Отмена
            </Button>
          </DialogClose>
          <Button disabled={pending} onClick={handleWithdraw}>
            {pending ? "Отзываем…" : "Отозвать предложение"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
