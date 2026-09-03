import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Мелкие детали форм, общие для всех экранов ввода: подпись, обязательность,
 * подсказка, ошибка поля и сообщение над кнопкой. Вынесены, чтобы формы
 * авторизации и формы кабинета выглядели одинаково, а не расходились
 * от копирования.
 */

export function Field({
  id,
  label,
  hint,
  error,
  children,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  label: string;
  hint?: ReactNode;
  /** Текст ошибки под полем. Показывается вместо подсказки. */
  error?: string;
}) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {props.required ? <span className="text-muted-foreground"> *</span> : null}
      </Label>

      {children ?? (
        <Input
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
      <p id={id} className="text-destructive text-xs">
        {error}
      </p>
    );
  }

  return hint ? (
    <p id={id} className="text-muted-foreground text-xs">
      {hint}
    </p>
  ) : null;
}

/** Сообщение об ошибке над кнопкой отправки. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** Успешное завершение: письмо отправлено, пароль изменён. */
export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p className="border-border bg-accent text-accent-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
      <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
