"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Field, FormErrors } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  MIN_PASSWORD_LENGTH,
  emptyPasswordForm,
  validatePasswordForm,
  type PasswordFormErrors,
  type PasswordFormValues,
} from "@/lib/password-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Смена пароля (ТЗ §5: «через Supabase SDK на фронте, отдельного эндпоинта нет»).
 *
 * Текущий пароль спрашивается не для галочки: `updateUser` меняет пароль
 * по одной живой сессии, то есть чужая вкладка с угнанной сессией меняла бы
 * пароль и запирала владельца снаружи. Проверка — вход тем же email и паролем:
 * пользователь тот же, сессия просто обновляется.
 */
export function PasswordForm({ email }: { email: string }) {
  const [values, setValues] = useState<PasswordFormValues>(emptyPasswordForm);
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [formError, setFormError] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  function setField(field: keyof PasswordFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validatePasswordForm(values);
    setErrors(found);

    if (Object.values(found).some(Boolean)) {
      setFormError(["Проверьте выделенные поля"]);
      return;
    }

    setPending(true);

    const auth = getSupabaseBrowserClient().auth;
    const { error: signInError } = await auth.signInWithPassword({
      email,
      password: values.currentPassword,
    });

    if (signInError) {
      // Неверный пароль объясняется под самим полем: общая фраза Supabase
      // («неверный email или пароль») здесь ещё и врёт — адрес не менялся.
      // Остальные отказы — лимит попыток, недоступность — показываем как есть.
      if (signInError.code === "invalid_credentials") {
        setErrors({ currentPassword: "Неверный текущий пароль" });
      } else {
        setFormError([authErrorMessage(signInError)]);
      }

      setPending(false);
      return;
    }

    const { error: updateError } = await auth.updateUser({ password: values.password });

    if (updateError) {
      setFormError([authErrorMessage(updateError)]);
      setPending(false);
      return;
    }

    // Пароль в состоянии формы не держим ни секунды дольше нужного.
    setValues(emptyPasswordForm);
    setPending(false);
    toast.success("Пароль изменён", {
      description: "В следующий раз входите с новым паролем",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пароль</CardTitle>
        <CardDescription>
          Пароль хранит Supabase Auth — наш сервер его не видит. Текущая сессия
          после смены сохраняется, выходить и входить заново не нужно.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {/* Скрытое поле с адресом: без него менеджер паролей не понимает,
              для какой учётной записи сохранять новый пароль. */}
          <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

          <Field
            id="currentPassword"
            name="currentPassword"
            type="password"
            label="Текущий пароль"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) => setField("currentPassword", event.target.value)}
            error={errors.currentPassword}
            disabled={pending}
            required
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="newPassword"
              name="newPassword"
              type="password"
              label="Новый пароль"
              autoComplete="new-password"
              hint={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
              value={values.password}
              onChange={(event) => setField("password", event.target.value)}
              error={errors.password}
              disabled={pending}
              required
            />
            <Field
              id="newPasswordConfirm"
              name="newPasswordConfirm"
              type="password"
              label="Новый пароль ещё раз"
              autoComplete="new-password"
              value={values.passwordConfirm}
              onChange={(event) => setField("passwordConfirm", event.target.value)}
              error={errors.passwordConfirm}
              disabled={pending}
              required
            />
          </div>

          {formError ? <FormErrors messages={formError} /> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Меняем…" : "Изменить пароль"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
