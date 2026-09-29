"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AuthHeader } from "@/components/auth/auth-header";
import { Button } from "@/components/ui/button";
import { resolveAfterAuthHref } from "@/lib/auth-redirect";
import { callbackPurpose, parseCallbackLink, type CallbackLink } from "@/lib/callback-link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Фрагмент адреса не меняется, пока открыт экран: подписываться не на что. */
function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * Вход по ссылке, которая приносит токены без PKCE: во фрагменте
 * (`#access_token=…`, так отвечают ссылки Admin API и панели Supabase) или
 * одноразовым `?token_hash=` (шаблон письма, собранный вручную).
 *
 * Вход не происходит сам: экран говорит, чья учётная запись откроется,
 * и ждёт кнопки — иначе чужую ссылку можно было бы подсунуть человеку и
 * незаметно посадить его в чужой аккаунт (`lib/callback-link.ts`). Заодно
 * одноразовый `token_hash` больше не сгорает от почтовых сканеров, которые
 * открывают ссылки из писем заранее: без нажатия он не тратится.
 */
export function CompleteCallback({
  next,
  tokenHash,
  type,
}: {
  next: string;
  tokenHash: string | null;
  type: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // Фрагмент есть только в браузере: на сервере — `null`, и экран ждёт.
  const hash = useSyncExternalStore(
    subscribeNever,
    () => window.location.hash.slice(1),
    () => null,
  );

  const link = useMemo((): CallbackLink | null | undefined => {
    if (hash === null) return undefined;

    const search = new URLSearchParams();
    if (tokenHash) search.set("token_hash", tokenHash);
    if (type) search.set("type", type);

    return parseCallbackLink(hash, search);
  }, [hash, tokenHash, type]);

  useEffect(() => {
    if (link === null) router.replace("/login?error=link");
  }, [link, router]);

  async function signIn(target: CallbackLink) {
    setPending(true);

    const auth = getSupabaseBrowserClient().auth;
    const { error } =
      target.kind === "session"
        ? await auth.setSession({
            access_token: target.accessToken,
            refresh_token: target.refreshToken,
          })
        : await auth.verifyOtp({ type: target.type, token_hash: target.tokenHash });

    if (error) {
      setFailed(true);
      router.replace("/login?error=link");
      return;
    }

    // Токены больше не нужны в адресной строке — они попадают в историю.
    window.history.replaceState(null, "", window.location.pathname);

    router.replace(await resolveAfterAuthHref(next));
    router.refresh();
  }

  if (failed) {
    return <AuthHeader title="Ссылка не сработала" description="Открываем страницу входа…" />;
  }

  if (!link) {
    return (
      <div className="flex flex-col gap-8" aria-live="polite">
        <AuthHeader title="Проверяем ссылку" description="Это займёт пару секунд." />
        <Loader2 className="text-primary size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        title="Продолжить вход?"
        description={`${callbackPurpose(link)} Продолжайте, только если сами открыли ссылку из своего письма.`}
      />

      <div className="flex flex-col gap-3">
        <Button size="xl" className="w-full" onClick={() => void signIn(link)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Продолжить
          {pending ? null : <ArrowRight aria-hidden />}
        </Button>
        {/* `replace`, а не переход: токены из адреса не должны остаться в истории. */}
        <Button
          variant="outline"
          size="xl"
          className="w-full"
          onClick={() => router.replace("/login")}
          disabled={pending}
        >
          Это не моё письмо
        </Button>
      </div>
    </div>
  );
}
