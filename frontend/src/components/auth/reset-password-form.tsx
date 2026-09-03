"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { resolveAfterAuthHref } from "@/lib/auth-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Установка нового пароля (ТЗ §5).
 *
 * Форма работает поверх временной сессии, которую создала ссылка из письма:
 * без неё Supabase не примет смену пароля и вернёт ошибку.
 */

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }

    if (password !== String(form.get("passwordConfirm"))) {
      setError("Пароли не совпадают");
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
