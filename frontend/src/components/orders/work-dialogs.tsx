"use client";

import { Ruler, SendHorizonal, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ORDER_LIMITS, type OrderDetail } from "@/lib/types";

import { Field, FieldMessage, FormError } from "@/components/form-parts";
import { FileDropzone } from "@/components/orders/file-dropzone";
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
import { apiErrorMessage, apiErrorMessages } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import { validateSquareMeters } from "@/lib/order-form";
import {
  countRoundFiles,
  describeUpload,
  emptyWorkFilesForm,
  toVerifiedAreaBody,
  toWorkFilesFormData,
  validateWorkFilesForm,
  type WorkFilesFormErrors,
  type WorkFilesFormValues,
} from "@/lib/work-form";

/**
 * Действия компании-исполнителя по заказу (ТЗ §4.1, §5).
 *
 * Три диалога, потому что три разных решения: что приложить, готово ли сдавать
 * и сколько на объекте площади на самом деле. Общего у них только обвязка
 * (запрос, тост, обновление карточки), и её здесь ровно столько, сколько
 * дешевле повторить, чем обобщать.
 *
 * Все три маршрута возвращают свежий `OrderDetail`, поэтому карточка меняется
 * ответом сервера сразу — предсказывать номер сдачи и состав файлов не нужно.
 */

/** Файлы сдачи вместе с обязательным комментарием (ТЗ §4.1). */
export function AddWorkFilesDialog({
  orderId,
  round,
  filesInRound,
}: {
  orderId: string;
  /** Номер сдачи, в которую уйдут файлы: он виден компании до отправки. */
  round: number;
  /**
   * Сколько файлов в этой сдаче уже есть. Нужен, чтобы посчитать по ответу
   * API, что действительно добавилось: дубликаты отсеиваются молча.
   */
  filesInRound: number;
}) {
  const sync = useOrderSync();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<WorkFilesFormValues>(emptyWorkFilesForm);
  const [errors, setErrors] = useState<WorkFilesFormErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  /** Открытие начинает загрузку заново: черновик прошлого раза только мешает. */
  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(emptyWorkFilesForm);
      setErrors({});
      setFormError(null);
    }

    setOpen(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateWorkFilesForm(values);
    setErrors(found);

    if (Object.values(found).some(Boolean)) {
      setFormError(["Проверьте выделенные поля"]);
      return;
    }

    setPending(true);

    try {
      const detail = await browserApi.post<OrderDetail>(
        `/orders/${orderId}/files`,
        toWorkFilesFormData(values),
      );

      // Считаем по ответу, а не по числу выбранных файлов: те, что уже есть
      // в этой сдаче, backend отбрасывает и уведомление клиенту не создаёт.
      const outcome = describeUpload(countRoundFiles(detail, round) - filesInRound, round);

      const notify = outcome.changed ? toast.success : toast.info;
      notify(outcome.title, { description: outcome.description });

      setOpen(false);
      sync.apply(detail);
    } catch (error) {
      setFormError(
        apiErrorMessages(
          error,
          "Не удалось загрузить файлы. Проверьте соединение и попробуйте ещё раз",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="size-4" aria-hidden />
          Добавить файлы
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Файлы к сдаче №{round}</DialogTitle>
          <DialogDescription>
            Клиент увидит файлы и комментарий сразу и получит уведомление. Пока
            работа не сдана, в эту же сдачу можно доложить ещё — сданной она
            станет только после кнопки «Сдать работу».
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="work-files">
              Файлы
              <span className="text-muted-foreground"> *</span>
            </Label>
            <FileDropzone
              id="work-files"
              files={values.files}
              onChange={(files) => {
                setValues((current) => ({ ...current, files }));
                setErrors((current) => ({ ...current, files: undefined }));
              }}
              disabled={pending}
            />
            <FieldMessage
              error={errors.files}
              hint="Чертежи, планы, фотографии выполненных работ"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="work-comment">
              Комментарий к сдаче
              <span className="text-muted-foreground"> *</span>
            </Label>
            <Textarea
              id="work-comment"
              rows={4}
              maxLength={ORDER_LIMITS.comment.max}
              placeholder="Что сделано, что приложено, на что обратить внимание"
              value={values.comment}
              onChange={(event) => {
                setValues((current) => ({ ...current, comment: event.target.value }));
                setErrors((current) => ({ ...current, comment: undefined }));
              }}
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby="work-comment-message"
              disabled={pending}
            />
            <FieldMessage
              id="work-comment-message"
              error={errors.comment}
              hint="Описывает сдачу целиком: при повторной загрузке заменяется на новый"
            />
          </div>

          {formError ? <FormErrors messages={formError} /> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Загружаем…" : "Загрузить файлы"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Сдача работы клиенту на подтверждение (ТЗ §4). */
export function SubmitWorkDialog({
  orderId,
  orderLabel,
  round,
}: {
  orderId: string;
  orderLabel: string;
  round: number;
}) {
  const sync = useOrderSync();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);

    try {
      const detail = await browserApi.post<OrderDetail>(`/orders/${orderId}/submit`);

      toast.success("Работа сдана", {
        description: `${orderLabel} · сдача №${round} ушла клиенту на подтверждение`,
      });

      sync.apply(detail);
    } catch (error) {
      toast.error("Не удалось сдать работу", {
        description: apiErrorMessage(error, "Проверьте соединение и попробуйте ещё раз"),
      });
      // После отказа заказ перечитывается: кнопка должна исчезнуть, если
      // сдавать уже нечего.
      sync.reload();
    } finally {
      setPending(false);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <SendHorizonal className="size-4" aria-hidden />
          Сдать работу
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сдать {orderLabel} на подтверждение?</DialogTitle>
          <DialogDescription>
            Клиент получит сдачу №{round} и решит: принять работу или вернуть
            на доработку. Дополнить эту сдачу файлами после отправки будет нельзя.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Отмена
            </Button>
          </DialogClose>
          <Button disabled={pending} onClick={handleSubmit}>
            {pending ? "Отправляем…" : "Сдать работу"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Уточнение площади объекта исполнителем (ТЗ §4.1). */
export function VerifyAreaDialog({
  orderId,
  squareMeters,
  verifiedSquareMeters,
}: {
  orderId: string;
  /** Площадь, указанная клиентом: она остаётся на странице как была. */
  squareMeters: number;
  /** Уже уточнённая площадь — тогда форма открывается заполненной. */
  verifiedSquareMeters: number | null;
}) {
  const sync = useOrderSync();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  /** Открытие возвращает поле к тому, что сейчас в заказе: страница могла обновиться. */
  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(verifiedSquareMeters === null ? "" : String(verifiedSquareMeters));
      setError(undefined);
      setFormError(null);
    }

    setOpen(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found = validateSquareMeters(value);
    setError(found);
    setFormError(null);

    if (found) return;

    setPending(true);

    try {
      const detail = await browserApi.patch<OrderDetail>(
        `/orders/${orderId}/verified-area`,
        toVerifiedAreaBody(value),
      );

      toast.success("Площадь уточнена", {
        description: "Клиент увидит оба значения: своё и ваше",
      });

      setOpen(false);
      sync.apply(detail);
    } catch (requestError) {
      setFormError(
        apiErrorMessages(
          requestError,
          "Не удалось уточнить площадь. Проверьте соединение и попробуйте ещё раз",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Ruler className="size-4" aria-hidden />
          {verifiedSquareMeters === null ? "Уточнить площадь" : "Изменить площадь"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Уточнить площадь объекта</DialogTitle>
          <DialogDescription>
            Клиент указал {squareMeters} м². Ваше значение не заменит его —
            на странице будут видны оба. Статус заказа и цену это не меняет.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Field
            id="verifiedSquareMeters"
            label="Фактическая площадь, м²"
            inputMode="decimal"
            placeholder="100"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            error={error}
            hint="По вашему замеру"
            disabled={pending}
            required
            autoFocus
          />

          {formError ? <FormErrors messages={formError} /> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Сообщения об ошибке запроса: одно строкой, несколько — списком. */
function FormErrors({ messages }: { messages: string[] }) {
  return (
    <FormError>
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <span className="flex flex-col gap-1">
          {messages.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </span>
      )}
    </FormError>
  );
}
