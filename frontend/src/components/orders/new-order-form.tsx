"use client";

import { ArrowRight, ArrowUpFromLine, ClipboardList, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  ObjectType,
  ORDER_LIMITS,
  OrderCategory,
  objectTypeLabels,
  orderCategoryLabels,
  type OrderDetail,
} from "@/lib/types";

import { DatePicker } from "@/components/date-picker";
import {
  Field,
  FieldMessage,
  FormActions,
  FormErrors,
  FormSection,
} from "@/components/form-parts";
import { FileDropzone } from "@/components/orders/file-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessages } from "@/lib/api-errors";
import { browserApi } from "@/lib/api.client";
import { todayIsoDate } from "@/lib/form-input";
import { newOrderSteps } from "@/lib/new-order-guide";
import {
  emptyOrderForm,
  toOrderFormData,
  validateOrderForm,
  type OrderFormErrors,
  type OrderFormField,
  type OrderFormValues,
} from "@/lib/order-form";

/**
 * Создание заказа (ТЗ §4.1, §7).
 *
 * Две колонки, как на макете: слева задание и файлы, справа — «что будет
 * дальше» и объяснение про бюджет. Подсказки справа не украшение: клиент
 * заполняет форму до того, как хоть раз видел сделку, и без них непонятно,
 * чем отличается его бюджет от цены, которую он потом увидит в заказе.
 *
 * Форма отправляется из браузера, а не серверным действием: файлы уходят
 * в API напрямую, без лишнего перекладывания через процесс Next.js.
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
      // Сообщения валидации приходят списком строк без имени поля, поэтому
      // показать их под конкретным полем нельзя — и не нужно: то же самое
      // форма проверяет до отправки, а сюда доезжает разве что расхождение
      // правил.
      setFormError(
        apiErrorMessages(
          error,
          "Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз",
        ),
      );
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <FormSection icon={<ClipboardList className="size-[1.0625rem]" />} title="Детали проекта">
          <Field
            id="title"
            label="Название заказа"
            placeholder="Например: Ремонт квартиры 100 м²"
            maxLength={ORDER_LIMITS.title.max}
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">
              Описание работ
              <span className="text-muted-foreground"> *</span>
            </Label>
            <Textarea
              id="description"
              rows={5}
              maxLength={ORDER_LIMITS.description.max}
              placeholder="Опишите, что нужно сделать: состав работ, материалы, пожелания по срокам…"
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby="description-message"
              disabled={pending}
            />
            <FieldMessage
              id="description-message"
              error={errors.description}
              hint={`До ${ORDER_LIMITS.description.max} символов. Чем конкретнее, тем точнее будут предложения.`}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="squareMeters"
              label="Площадь, м²"
              inputMode="decimal"
              placeholder="100"
              className="font-mono"
              value={values.squareMeters}
              onChange={(event) => update("squareMeters", event.target.value)}
              error={errors.squareMeters}
              disabled={pending}
              required
            />

            <Field
              id="address"
              label="Адрес объекта"
              autoComplete="street-address"
              placeholder="Баку, ул. Низами, 84"
              maxLength={ORDER_LIMITS.address.max}
              value={values.address}
              onChange={(event) => update("address", event.target.value)}
              error={errors.address}
              disabled={pending}
              required
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="clientBudget"
              label="Бюджет, AZN"
              inputMode="decimal"
              placeholder="30600"
              className="font-mono"
              value={values.clientBudget}
              onChange={(event) => update("clientBudget", event.target.value)}
              error={errors.clientBudget}
              hint="Ориентир для компаний. Можно не указывать"
              disabled={pending}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="desiredStartDate">Желаемое начало</Label>
              <DatePicker
                id="desiredStartDate"
                value={values.desiredStartDate}
                onChange={(value) => update("desiredStartDate", value)}
                min={todayIsoDate()}
                disabled={pending}
                invalid={Boolean(errors.desiredStartDate)}
              />
              <FieldMessage
                error={errors.desiredStartDate}
                hint="Не раньше сегодняшнего дня"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          icon={<ArrowUpFromLine className="size-[1.0625rem]" />}
          title="Файлы проекта"
        >
          <div className="flex flex-col gap-2">
            {/* Подпись области выбора — sr-only: заголовок блока уже называет
                её, а вторая строка «Файлы» над самой областью повторяла бы
                его. Читалке подпись всё равно нужна. */}
            <Label htmlFor="files" className="sr-only">
              Файлы проекта
            </Label>
            <FileDropzone id="files" files={files} onChange={setFiles} disabled={pending} />
            <FieldMessage hint="Планы, чертежи и фотографии помогут компаниям точнее оценить работу" />
          </div>
        </FormSection>

        {formError ? <FormErrors messages={formError} /> : null}

        <FormActions note="Заказ появится в ленте компаний сразу после публикации">
          <Button variant="outline" size="xl" asChild>
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
          <Button type="submit" size="xl" disabled={pending}>
            {pending ? "Публикуем…" : "Опубликовать заказ"}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </FormActions>
      </div>

      {/* Подсказки идут после формы в разметке, а не до: на узком экране
          колонки встают друг под друга, и объяснение не должно отодвигать
          поля вниз. */}
      <aside className="flex min-w-0 flex-col gap-6">
        <NextStepsCard />
        <BudgetNoteCard />
      </aside>
    </form>
  );
}

/** «Что будет дальше»: три шага сделки словами, до её начала. */
function NextStepsCard() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-primary font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
          Что будет дальше
        </p>

        <ol className="flex flex-col gap-4">
          {newOrderSteps.map((step) => (
            <li key={step.number} className="flex gap-3.5">
              <span className="text-primary shrink-0 font-mono text-[0.8125rem]" aria-hidden>
                {step.number}
              </span>
              <span className="text-secondary-foreground text-sm leading-relaxed">
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/**
 * Чем бюджет отличается от цены сделки (ТЗ §3: это разные поля, и смешивать
 * их нельзя). Объяснение стоит рядом с полем бюджета, а не в подсказке под
 * ним: в одну строку под полем оно не помещается.
 */
function BudgetNoteCard() {
  return (
    <div className="bg-brand-surface rounded-xl border px-5 py-5">
      <p className="flex items-center gap-2.5">
        <Info className="text-primary size-[1.125rem] shrink-0" aria-hidden />
        <span className="font-heading text-base font-semibold">Бюджет — это ориентир</span>
      </p>
      <p className="text-secondary-foreground mt-2.5 text-sm leading-relaxed">
        Компании видят его и считают от него. Настоящая цена появится, когда вы
        примете предложение, — до этого момента она не зафиксирована.
      </p>
    </div>
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
