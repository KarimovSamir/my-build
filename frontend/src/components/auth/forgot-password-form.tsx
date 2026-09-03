"use client";

import { useState, type FormEvent } from "react";

import { Field, FormError, FormSuccess } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Запрос письма для сброса пароля (ТЗ §5).
 *
 * Результат намеренно одинаков и для существующего адреса, и для чужого:
 * иначе форма превращается в способ узнать, кто зарегистрирован в сервисе.
 */
export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const email = String(new FormData(event.currentTarget).get("email")).trim();

    const { error: authError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/callback?next=/reset-password` },
    );

    if (authError) {
      setError(authErrorMessage(authError));
      setPending(false);
      return;
    }

    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <FormSuccess>
        Если такой адрес зарегистрирован, мы отправили на него письмо со ссылкой для
        смены пароля.
      </FormSuccess>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />

      {error ? <FormError>{error}</FormError> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Отправляем…" : "Отправить ссылку"}
      </Button>
    </form>
  );
}
