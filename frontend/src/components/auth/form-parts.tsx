import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Мелкие детали форм авторизации, общие для четырёх экранов.
 * Вынесены, чтобы подпись, обязательность и разметка ошибки выглядели
 * одинаково во всех формах, а не расходились от копирования.
 */

export function Field({
  id,
  label,
  hint,
  children,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {props.required ? <span className="text-muted-foreground"> *</span> : null}
      </Label>
      {children ?? <Input id={id} {...props} />}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
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
