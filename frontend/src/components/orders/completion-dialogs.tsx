"use client";

import { CircleCheckBig, RotateCcw } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { ORDER_LIMITS, type OrderDetail } from "@/lib/types";

import { FieldMessage, FormError } from "@/components/form-parts";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessages } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import {
  validateCompletionComment,
  validateCorrectionComment,
} from "@/lib/completion-form";

/**
 * Решение клиента по сданной работе (ТЗ §4).
 *
 * Два диалога с одной формой из одного поля: разница между ними в том,
 * обязателен ли комментарий. При подтверждении он по желанию, при доработке —
 * обязателен: это и есть её содержание.
 */

export function ConfirmWorkDialog({
  orderId,
  orderLabel,
}: {
  orderId: string;
  orderLabel: string;
}) {
  return (
    <CompletionDecision
      trigger={
        <Button>
          <CircleCheckBig className="size-4" aria-hidden />
          Подтвердить выполнение
        </Button>
      }
      title={`Подтвердить выполнение ${orderLabel}?`}
      description="Заказ перейдёт в статус «Завершён». Отправить его на доработку после этого будет нельзя."
      label="Комментарий"
      hint="Необязательно — например, благодарность исполнителю"
      placeholder="Всё сделано в срок, замечаний нет"
      validate={validateCompletionComment}
      // Пустой комментарий не отправляется вовсе: `ValidationPipe` настроен
      // на `forbidNonWhitelisted`, и пустой строки в теле быть не должно.
      toBody={(comment): Record<string, string> => (comment ? { comment } : {})}
      path={`/orders/${orderId}/confirm`}
      submitLabel="Подтвердить"
      pendingLabel="Подтверждаем…"
      successTitle="Работа принята"
      successText={`${orderLabel} завершён`}
      fallbackError="Не удалось подтвердить выполнение. Проверьте соединение и попробуйте ещё раз"
    />
  );
}

export function DisputeWorkDialog({
  orderId,
  orderLabel,
}: {
  orderId: string;
  orderLabel: string;
}) {
  return (
    <CompletionDecision
      trigger={
        <Button variant="outline">
          <RotateCcw className="size-4" aria-hidden />
          Отправить на доработку
        </Button>
      }
      title={`Отправить ${orderLabel} на доработку?`}
      description="Компания увидит ваш комментарий и сможет загрузить исправленные файлы новой сдачей."
      label="Что нужно доработать"
      hint="Компания увидит этот текст целиком"
      placeholder="На плане не хватает размеров санузла, толщина стен не совпадает с замером"
      required
      validate={validateCorrectionComment}
      toBody={(comment) => ({ correctionComment: comment })}
      path={`/orders/${orderId}/dispute`}
      submitLabel="Отправить на доработку"
      pendingLabel="Отправляем…"
      successTitle="Работа отправлена на доработку"
      successText={`${orderLabel} вернулся исполнителю`}
      fallbackError="Не удалось отправить на доработку. Проверьте соединение и попробуйте ещё раз"
    />
  );
}

/** Общая обвязка: одно поле, проверка, запрос, тост, обновление карточки. */
function CompletionDecision({
  trigger,
  title,
  description,
  label,
  hint,
  placeholder,
  required = false,
  validate,
  toBody,
  path,
  submitLabel,
  pendingLabel,
  successTitle,
  successText,
  fallbackError,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  hint: string;
  placeholder: string;
  required?: boolean;
  validate: (value: string) => string | undefined;
  toBody: (comment: string) => Record<string, string>;
  path: string;
  submitLabel: string;
  pendingLabel: string;
  successTitle: string;
  successText: string;
  fallbackError: string;
}) {
  const sync = useOrderSync();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  /** Открытие начинает разговор заново: черновик прошлого раза только мешает. */
  function handleOpenChange(next: boolean) {
    if (next) {
      setComment("");
      setError(undefined);
      setFormError(null);
    }

    setOpen(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found = validate(comment);
    setError(found);
    setFormError(null);

    if (found) return;

    setPending(true);

    try {
      const order = await browserApi.post<OrderDetail>(path, toBody(comment.trim()));

      toast.success(successTitle, { description: successText });
      setOpen(false);
      // Ответ — уже свежий заказ: статус, комментарий и состав кнопок
      // меняются сразу, без ожидания серверного ре-рендера.
      sync.apply(order);
    } catch (requestError) {
      setFormError(apiErrorMessages(requestError, fallbackError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="completion-comment">
              {label}
              {required ? <span className="text-muted-foreground"> *</span> : null}
            </Label>
            <Textarea
              id="completion-comment"
              rows={4}
              maxLength={ORDER_LIMITS.comment.max}
              placeholder={placeholder}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setError(undefined);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby="completion-comment-message"
              disabled={pending}
              autoFocus
            />
            <FieldMessage id="completion-comment-message" error={error} hint={hint} />
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

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
