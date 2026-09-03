"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError, FormSuccess } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authErrorMessage } from "@/lib/auth-errors";
import { getHomeHref } from "@/lib/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidPhone, PHONE_ERROR_MESSAGE, Role, roleLabels } from "@/lib/types";

/**
 * Регистрация (ТЗ §5).
 *
 * Учётную запись создаёт Supabase Auth, а профиль в нашей базе — триггер
 * из метаданных, которые уходят в `signUp`. Поэтому набор полей здесь
 * обязан совпадать с тем, что ждёт триггер: роль, имя, телефон, а для
 * компании ещё и название.
 */

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(Role.CLIENT);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const phone = text(form, "phone") ?? "";

    // Тот же формат проверяет `PATCH /profile`: правило одно, в `shared/`.
    if (!isValidPhone(phone)) {
      setError(PHONE_ERROR_MESSAGE);
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }

    if (password !== String(form.get("passwordConfirm"))) {
      setError("Пароли не совпадают");
      return;
    }

    setPending(true);

    const { data, error: authError } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: {
        // Ссылка из письма приведёт сюда, а обработчик обменяет её на сессию.
        emailRedirectTo: `${window.location.origin}/callback`,
        data: {
          role,
          firstName: text(form, "firstName"),
          lastName: text(form, "lastName"),
          phone,
          companyName: role === Role.COMPANY ? text(form, "companyName") : undefined,
          city: text(form, "city"),
          country: text(form, "country"),
        },
      },
    });

    if (authError) {
      setError(authErrorMessage(authError));
      setPending(false);
      return;
    }

    // Сессия приходит сразу, только если подтверждение email выключено.
    if (data.session) {
      router.replace(getHomeHref(role));
      router.refresh();
      return;
    }

    setEmailSent(email);
    setPending(false);
  }

  if (emailSent) {
    return (
      <FormSuccess>
        Мы отправили письмо на <strong>{emailSent}</strong>. Перейдите по ссылке из
        письма, чтобы подтвердить адрес и войти.
      </FormSuccess>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field id="role" label="Кто вы" required>
        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={Role.CLIENT}>
              {roleLabels.CLIENT} — хочу заказать работы
            </SelectItem>
            <SelectItem value={Role.COMPANY}>
              {roleLabels.COMPANY} — хочу получать заказы
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {role === Role.COMPANY ? (
        <Field
          id="companyName"
          name="companyName"
          label="Название компании"
          placeholder="ООО «СтройГрад»"
          hint="Его увидит клиент в списке предложений"
          required
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="firstName"
          name="firstName"
          label="Имя"
          autoComplete="given-name"
          required
        />
        <Field
          id="lastName"
          name="lastName"
          label="Фамилия"
          autoComplete="family-name"
        />
      </div>

      <Field
        id="phone"
        name="phone"
        type="tel"
        label="Телефон"
        autoComplete="tel"
        placeholder="+7 900 000-00-00"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="city" name="city" label="Город" autoComplete="address-level2" />
        <Field id="country" name="country" label="Страна" autoComplete="country-name" />
      </div>

      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="password"
          name="password"
          type="password"
          label="Пароль"
          autoComplete="new-password"
          hint={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
          required
        />
        <Field
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          label="Пароль ещё раз"
          autoComplete="new-password"
          required
        />
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </Button>
    </form>
  );
}

/** Значение поля без пробелов по краям; пустое считается незаполненным. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed === "" ? undefined : trimmed;
}
