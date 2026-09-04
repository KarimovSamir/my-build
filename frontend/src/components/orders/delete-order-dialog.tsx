"use client";

import { Trash2 } from "lucide-react";
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
 * Удаление заказа с подтверждением (ТЗ §4.1).
 *
 * Кнопка показывается только владельцу и только в статусах, где удаление
 * разрешено, — список статусов общий с backend (`DELETABLE_ORDER_STATUSES`).
 * Отказ всё равно возможен: пока страница открыта, компания могла прислать
 * предложение и заказ мог уйти в работу. Поэтому ответ 409 показывается
 * пользователю как есть, а не превращается в «что-то пошло не так».
 */
export function DeleteOrderDialog({
  orderId,
  orderLabel,
}: {
  orderId: string;
  /** Как заказ называется в вопросе: «Удалить заказ ORD-24?» */
  orderLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);

    try {
      await browserApi.delete(`/orders/${orderId}`);

      toast.success("Заказ удалён", {
        description: `${orderLabel} и приложенные к нему файлы больше не доступны`,
      });

      router.push("/orders");
      // Список рендерится на сервере: без этого он вернулся бы из кэша
      // роутера вместе с только что удалённой строкой.
      router.refresh();
    } catch (error) {
      toast.error("Не удалось удалить заказ", {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
      setPending(false);
      setOpen(false);
      // Статус мог измениться прямо сейчас — перечитываем страницу, чтобы
      // кнопка исчезла, если удалять уже нечего.
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="size-4" aria-hidden />
          Удалить заказ
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить {orderLabel}?</DialogTitle>
          <DialogDescription>
            Заказ и все приложенные файлы будут удалены безвозвратно. Компании
            перестанут видеть его в ленте.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Отмена
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending ? "Удаляем…" : "Удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
