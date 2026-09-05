"use client";

import { Send, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { formatOrderNumber, isPendingOffer, OFFER_LIMITS, type OfferDto } from "@/lib/types";

import { DatePicker } from "@/components/date-picker";
import { Field, FieldMessage, FormError } from "@/components/form-parts";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessages } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import { todayIsoDate } from "@/lib/form-input";
import {
  offerFormValues,
  toOfferBody,
  validateOfferForm,
  type OfferFormErrors,
  type OfferFormField,
  type OfferFormValues,
} from "@/lib/offer-form";

/**
 * Отправка предложения по заказу (ТЗ §4.1).
 *
 * Один диалог и на первую отправку, и на изменение: одна компания подаёт
 * по заказу ровно одно предложение, а повторная отправка обновляет его
 * (семантика upsert). Разница только в словах на кнопке и в том, что форма
 * открывается заполненной, — пользователю обещать «создам второе» нельзя.
 *
 * «Изменить» — только про предложение, которое ещё ждёт выбора клиента.
 * Отозванное или отклонённое компания отправляет заново: строка в базе та же,
 * но для пользователя это новое предложение, а не правка старого. Прежние
 * цена и срок при этом подставляются — их обычно и повторяют.
 *
 * Заказ перечитывается после успеха: отправленное предложение уводит заказ
 * из ленты, а в списке предложений меняет цену и срок.
 */
export function OfferDialog({
  order,
  offer = null,
  variant = "default",
}: {
  order: { id: string; orderNumber: number; title: string };
  /** Прежнее предложение по этому заказу — тогда диалог открывается заполненным. */
  offer?: OfferDto | null;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<OfferFormValues>(() => offerFormValues(offer));
  const [errors, setErrors] = useState<OfferFormErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  const isUpdate = offer !== null && isPendingOffer(offer.status);
  const orderLabel = formatOrderNumber(order.orderNumber);

  /** Правка поля убирает его ошибку: сообщение о старом значении только мешает. */
  function update(field: OfferFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  /**
   * Открытие возвращает форму к тому, что сейчас в предложении: между двумя
   * открытиями страница могла обновиться, а закрытый диалог сохранял бы
   * недоотправленный черновик и показывал его как действующую цену.
   */
  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(offerFormValues(offer));
      setErrors({});
      setFormError(null);
    }

    setOpen(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateOfferForm(values);
    setErrors(found);

    if (Object.values(found).some(Boolean)) {
      setFormError(["Проверьте выделенные поля"]);
      return;
    }

    setPending(true);

    try {
      await browserApi.post<OfferDto>("/offers", toOfferBody(order.id, values));

      toast.success(isUpdate ? "Предложение обновлено" : "Предложение отправлено", {
        description: `${orderLabel} · ${order.title}`,
      });

      setOpen(false);
      // Списки рендерятся на сервере: без этого лента вернулась бы из кэша
      // роутера вместе с заказом, по которому предложение уже отправлено.
      router.refresh();
    } catch (error) {
      setFormError(
        apiErrorMessages(
          error,
          "Не удалось отправить предложение. Проверьте соединение и попробуйте ещё раз",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          {isUpdate ? (
            <SquarePen className="size-4" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {isUpdate ? "Изменить предложение" : "Отправить предложение"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? "Изменить предложение" : "Предложение по заказу"}
          </DialogTitle>
          <DialogDescription>
            {orderLabel} · {order.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Field
            id="proposedPrice"
            label="Ваша цена, USD"
            inputMode="decimal"
            placeholder="150000"
            value={values.proposedPrice}
            onChange={(event) => update("proposedPrice", event.target.value)}
            error={errors.proposedPrice}
            hint="Ориентируйтесь на бюджет клиента, но он вас не ограничивает"
            disabled={pending}
            required
            autoFocus
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="proposedDeadline">
              Срок выполнения
              <span className="text-muted-foreground"> *</span>
            </Label>
            <DatePicker
              id="proposedDeadline"
              value={values.proposedDeadline}
              onChange={(value) => update("proposedDeadline", value)}
              min={todayIsoDate()}
              disabled={pending}
              invalid={Boolean(errors.proposedDeadline)}
            />
            <FieldMessage
              error={errors.proposedDeadline}
              hint="Дата, к которой работы будут завершены"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea
              id="comment"
              rows={4}
              maxLength={OFFER_LIMITS.comment.max}
              placeholder="Что входит в цену, из чего складывается срок, какие есть условия"
              value={values.comment}
              onChange={(event) => update("comment", event.target.value)}
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby={errors.comment ? "comment-error" : undefined}
              disabled={pending}
            />
            <FieldMessage
              id="comment-error"
              error={errors.comment}
              hint="Необязательно, но клиенту помогает выбрать"
            />
          </div>

          {formError ? (
            <FormError>
              {formError.length === 1 ? (
                formError[0]
              ) : (
                <span className="flex flex-col gap-1">
                  {formError.map((message) => (
                    <span key={message}>{message}</span>
                  ))}
                </span>
              )}
            </FormError>
          ) : null}

          <p className="text-muted-foreground text-xs">
            Предложение можно изменить или отозвать, пока клиент не выбрал
            исполнителя.
          </p>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Отправляем…" : isUpdate ? "Сохранить" : "Отправить предложение"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
