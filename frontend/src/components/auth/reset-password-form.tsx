"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { resolveAfterAuthHref } from "@/lib/auth-redirect";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/password-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Установка нового пароля (ТЗ §5).
 *
 * Форма работает поверх временной сессии, которую создала ссылка из письма:
 * без неё Supabase не примет смену пароля и вернёт ошибку.
 *
 * Требования к паролю — общие с регистрацией и настройками
 * (`lib/password-form.ts`).
 */

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));

    const issue = validateNewPassword(password, String(form.get("passwordConfirm")));

    if (issue) {
      setError(issue.message);
      return;
    }

    setPending(true);

    const { error: authError } = await getSupabaseBrowserClient().auth.updateUser({
      password,
    });

    if (authError) {
      setError(authErrorMessage(authError));
      setPending(false);
      return;
    }

    // Пароль сменён — пользователь уже вошедший, ведём сразу в его кабинет.
    router.replace(await resolveAfterAuthHref());
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="password"
        name="password"
        type="password"
        label="Новый пароль"
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

      {error ? <FormError>{error}</FormError> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Сохраняем…" : "Сохранить пароль"}
      </Button>
    </form>
  );
}
