"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { resolveAfterAuthHref } from "@/lib/auth-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Вход по email и паролю (ТЗ §5).
 *
 * Пароль проверяет Supabase Auth, он же ставит cookie сессии. После входа
 * страница обновляется целиком: серверные компоненты должны увидеть сессию.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });

    if (authError) {
      setError(authErrorMessage(authError));
      setPending(false);
      return;
    }

    // replace, а не push: возвращаться кнопкой «назад» на форму входа незачем.
    router.replace(await resolveAfterAuthHref(next));
    router.refresh();
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
      <Field
        id="password"
        name="password"
        type="password"
        label="Пароль"
        autoComplete="current-password"
        required
      />

      {error ? <FormError>{error}</FormError> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
