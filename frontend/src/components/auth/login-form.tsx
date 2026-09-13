"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { DEMO_PASSWORD, type DemoAccount } from "@/lib/types";

import { DemoAccounts } from "@/components/auth/demo-accounts";
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
 *
 * Поля управляемые не ради валидации, а ради демо-доступа: кнопка «Войти»
 * у демо-аккаунта и заполняет форму, и отправляет её. Вход один на оба пути —
 * иначе у демо появилась бы своя обработка ошибок и свой редирект.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(credentials: { email: string; password: string }) {
    setError(null);
    setPending(true);

    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void signIn({ email, password });
  }

  /**
   * Демо-вход: подставить и войти. Форма заполняется в том числе затем, чтобы
   * посетитель видел, под кем он вошёл, — и мог повторить вход руками.
   */
  function handleDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    void signIn({ email: account.email, password: DEMO_PASSWORD });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          required
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Пароль"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          required
        />

        {error ? <FormError>{error}</FormError> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Входим…" : "Войти"}
        </Button>
      </form>

      <DemoAccounts onPick={handleDemo} pending={pending} />
    </div>
  );
}
