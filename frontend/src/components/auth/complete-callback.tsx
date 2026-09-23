"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthHeader } from "@/components/auth/auth-header";
import { resolveAfterAuthHref } from "@/lib/auth-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Досборка сессии из фрагмента ссылки (`#access_token=…&refresh_token=…`).
 *
 * Так отвечают ссылки, выданные Admin API, — приглашения и письма,
 * отправленные из панели Supabase. Фрагмент не уходит на сервер, поэтому
 * разобрать его может только браузер.
 */
export function CompleteCallback({ next }: { next: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=link");
      return;
    }

    let cancelled = false;

    void (async () => {
      const { error } = await getSupabaseBrowserClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (error) {
        setFailed(true);
        router.replace("/login?error=link");
        return;
      }

      // Токены больше не нужны в адресной строке — они попадают в историю.
      window.history.replaceState(null, "", window.location.pathname);

      router.replace(await resolveAfterAuthHref(next));
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return (
    <div className="flex flex-col gap-8" aria-live="polite">
      {failed ? (
        <AuthHeader title="Ссылка не сработала" description="Открываем страницу входа…" />
      ) : (
        <AuthHeader title="Подтверждаем вход" description="Это займёт пару секунд." />
      )}
      {failed ? null : <Loader2 className="text-primary size-6 animate-spin" aria-hidden />}
    </div>
  );
}
