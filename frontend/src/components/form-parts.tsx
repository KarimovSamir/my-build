import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Мелкие детали форм, общие для всех экранов ввода: блок формы, подпись,
 * обязательность, подсказка, ошибка поля, сообщение над кнопкой и панель
 * действий. Вынесены, чтобы формы авторизации и формы кабинета выглядели
 * одинаково, а не расходились от копирования.
 */

/**
 * Блок формы: значок в плитке, заголовок антиквой и поля под ними.
 *
 * Плитка со значком — часть утверждённого макета: по ней блоки формы
 * отличаются друг от друга быстрее, чем по заголовку. Своей разметки
 * заголовка блоки не заводят — иначе кегли разойдутся между экранами.
 */
export function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-accent text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            {icon}
          </span>
          <CardTitle>{title}</CardTitle>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  );
}

/**
 * Панель отправки формы: что произойдёт после нажатия — слева, кнопки — справа.
 *
 * Отдельной карточкой, а не строкой в последнем блоке: форма длинная, и кнопка
 * отправки относится ко всей форме, а не к тому блоку, под которым оказалась.
 */
export function FormActions({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {note ? (
          <p className="text-muted-foreground min-w-0 font-mono text-xs">{note}</p>
        ) : null}
        {/* `ml-auto` держит кнопки справа и тогда, когда подсказка заняла
            строку целиком: у перенесённого элемента `justify-between` уже
            ничего не выравнивает. */}
        <div className="ml-auto flex shrink-0 flex-wrap gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}

export function Field({
  id,
  label,
  labelAside,
  hint,
  error,
  inputAs: Control = Input,
  children,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  label: string;
  /** Ссылка справа от подписи — «Забыли пароль?» у поля пароля на входе. */
  labelAside?: ReactNode;
  hint?: ReactNode;
  /** Текст ошибки под полем. Показывается вместо подсказки. */
  error?: string;
  /** Поле с теми же пропсами, что `Input`, но своим поведением — `PasswordInput`. */
  inputAs?: ComponentType<ComponentProps<typeof Input>>;
}) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const labelNode = (
    <Label htmlFor={id}>
      {label}
      {props.required ? <span className="text-muted-foreground"> *</span> : null}
    </Label>
  );

  return (
    <div className="flex flex-col gap-2">
      {labelAside ? (
        <div className="flex items-baseline justify-between gap-3">
          {labelNode}
          {labelAside}
        </div>
      ) : (
        labelNode
      )}

      {children ?? (
        <Control
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          {...props}
        />
      )}

      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

/**
 * Ошибка или подсказка под полем.
 *
 * Отдельный компонент, потому что поля со своим управляющим элементом
 * (`Select`, календарь, dropzone) собирают разметку сами, а сообщение под
 * ними обязано выглядеть так же, как у обычного `Input`.
 */
export function FieldMessage({
  id,
  error,
  hint,
}: {
  id?: string;
  error?: string;
  hint?: ReactNode;
}) {
  if (error) {
    return (
      <p id={id} className="text-destructive text-[0.8125rem]">
        {error}
      </p>
    );
  }

  return hint ? (
    <p id={id} className="text-muted-foreground text-[0.8125rem] leading-relaxed">
      {hint}
    </p>
  ) : null;
}

/** Сообщение об ошибке над кнопкой отправки. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-xl border p-3.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Ответ сервера об ошибке: одно сообщение строкой, несколько — списком.
 *
 * Валидация DTO приходит несколькими строками сразу (`apiErrorMessages`),
 * и склеивать их в одну фразу — значит превращать «поле A и поле B» в кашу.
 */
export function FormErrors({ messages }: { messages: string[] }) {
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

/** Успешное завершение: письмо отправлено, пароль изменён. */
export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p className="border-border bg-accent text-accent-foreground flex items-start gap-2.5 rounded-xl border p-3.5 text-sm">
      <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
