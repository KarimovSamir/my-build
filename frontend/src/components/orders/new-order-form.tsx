"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  ObjectType,
  OrderCategory,
  objectTypeLabels,
  orderCategoryLabels,
  type OrderDetail,
} from "@/lib/types";

import { DatePicker } from "@/components/date-picker";
import { Field, FieldMessage, FormError } from "@/components/form-parts";
import { FileDropzone } from "@/components/orders/file-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { browserApi } from "@/lib/api.client";
import {
  emptyOrderForm,
  todayIsoDate,
  toOrderFormData,
  validateOrderForm,
  type OrderFormErrors,
  type OrderFormField,
  type OrderFormValues,
} from "@/lib/order-form";

/**
 * Создание заказа (ТЗ §4.1, §7).
 *
 * Две колонки, как на макете: слева «Детали проекта» вместе с файлами, справа
 * «Бюджет и Локация». Форма отправляется из браузера, а не серверным действием:
 * файлы уходят в API напрямую, без лишнего перекладывания через процесс Next.js.
 */
export function NewOrderForm() {
  const router = useRouter();
  const [values, setValues] = useState<OrderFormValues>(emptyOrderForm);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<OrderFormErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  /** Правка поля убирает его ошибку: сообщение о старом значении только мешает. */
  function update(field: OrderFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateOrderForm(values);
    setErrors(found);

    if (Object.values(found).some(Boolean)) {
      setFormError(["Проверьте выделенные поля"]);
      return;
    }

    setPending(true);

    try {
      const order = await browserApi.post<OrderDetail>(
        "/orders",
        toOrderFormData(values, files),
      );

      toast.success("Заказ опубликован", {
        description: "Компании увидят его в ленте и пришлют предложения",
      });

      router.push(`/orders/${order.id}`);
      // Список заказов рендерится на сервере — без этого он остался бы в кэше
      // роутера без только что созданной строки.
      router.refresh();
    } catch (error) {
      setFormError(submitErrorMessages(error));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Детали проекта</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <Field
              id="title"
              label="Название заказа"
              placeholder="Ремонт квартиры 100 м²"
              value={values.title}
              onChange={(event) => update("title", event.target.value)}
              error={errors.title}
              disabled={pending}
              required
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="category"
                label="Категория"
                placeholder="Что нужно сделать"
                options={orderCategoryLabels}
                order={[OrderCategory.PLAN_CREATION, OrderCategory.PLAN_IMPLEMENTATION]}
                value={values.category}
                onChange={(value) => update("category", value)}
                error={errors.category}
                disabled={pending}
              />

              <SelectField
                id="objectType"
                label="Тип объекта"
                placeholder="Где ведутся работы"
                options={objectTypeLabels}
                order={[
                  ObjectType.APARTMENT,
                  ObjectType.HOUSE,
                  ObjectType.COMMERCIAL,
                  ObjectType.GOVERNMENT,
                ]}
                value={values.objectType}
                onChange={(value) => update("objectType", value)}
                error={errors.objectType}
                disabled={pending}
              />
            </div>

            <Field
              id="squareMeters"
              label="Площадь, м²"
              inputMode="decimal"
              placeholder="100"
              value={values.squareMeters}
              onChange={(event) => update("squareMeters", event.target.value)}
              error={errors.squareMeters}
              disabled={pending}
              required
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">
                Описание работ
                <span className="text-muted-foreground"> *</span>
              </Label>
              <Textarea
                id="description"
                rows={6}
                placeholder="Что именно нужно сделать, в каком состоянии объект, есть ли пожелания по материалам и срокам"
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={errors.description ? "description-error" : undefined}
                disabled={pending}
              />
              <FieldMessage id="description-error" error={errors.description} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="files">Файлы</Label>
              <FileDropzone
                id="files"
                files={files}
                onChange={setFiles}
                disabled={pending}
              />
              <FieldMessage hint="Планы, чертежи и фотографии помогут компаниям точнее оценить работу" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Бюджет и локация</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <Field
              id="clientBudget"
              label="Бюджет, USD"
              inputMode="decimal"
              placeholder="45000"
              value={values.clientBudget}
              onChange={(event) => update("clientBudget", event.target.value)}
              error={errors.clientBudget}
              hint="Ориентир для компаний. Можно не указывать"
              disabled={pending}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="desiredStartDate">Желаемая дата начала</Label>
              <DatePicker
                id="desiredStartDate"
                value={values.desiredStartDate}
                onChange={(value) => update("desiredStartDate", value)}
                min={todayIsoDate()}
                disabled={pending}
                invalid={Boolean(errors.desiredStartDate)}
              />
              <FieldMessage error={errors.desiredStartDate} hint="Не раньше сегодняшнего дня" />
            </div>

            <Field
              id="address"
              label="Адрес объекта"
              autoComplete="street-address"
              placeholder="Москва, ул. Ленина, 15"
              value={values.address}
              onChange={(event) => update("address", event.target.value)}
              error={errors.address}
              disabled={pending}
              required
            />
          </CardContent>
        </Card>
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

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" asChild>
          {/* Ссылка, а не `router.back()`: на форму приходят и по прямому
              адресу, и «назад» увёл бы неизвестно куда. */}
          <Link
            href="/orders"
            aria-disabled={pending || undefined}
            className={pending ? "pointer-events-none opacity-50" : undefined}
          >
            Отмена
          </Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Публикуем…" : "Опубликовать заказ"}
        </Button>
      </div>
    </form>
  );
}

/** Поле с выбором из перечисления: подпись, ошибка и подсказка как у обычного. */
function SelectField<T extends string>({
  id,
  label,
  placeholder,
  options,
  order,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: Record<T, string>;
  order: readonly T[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        <span className="text-muted-foreground"> *</span>
      </Label>

      {/* `name` нужен скрытому полю, которое Radix рендерит внутри формы:
          без имени браузер помечает его как ошибку разметки. */}
      <Select name={id} value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {order.map((option) => (
            <SelectItem key={option} value={option}>
              {options[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FieldMessage id={`${id}-error`} error={error} />
    </div>
  );
}

/**
 * Ответ API в виде сообщений над кнопкой.
 *
 * Сообщения валидации приходят списком строк без имени поля, поэтому показать
 * их под конкретным полем нельзя — и не нужно: то же самое форма проверяет
 * до отправки, а сюда доезжает разве что расхождение правил.
 */
function submitErrorMessages(error: unknown): string[] {
  if (!(error instanceof ApiRequestError)) {
    return ["Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз"];
  }

  if (error.statusCode === 401) {
    return ["Сессия истекла. Войдите заново и повторите отправку"];
  }

  const messages = error.validationMessages;

  return messages.length > 0 ? messages : [error.message];
}
