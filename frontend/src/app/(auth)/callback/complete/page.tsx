import { CompleteCallback } from "@/components/auth/complete-callback";
import { safeNextPath } from "@/lib/redirects";

export const metadata = { title: "Подтверждение" };

/**
 * Подтверждение входа по ссылке без PKCE: токены во фрагменте (`#access_token=…`)
 * или одноразовый `?token_hash=`. Фрагмент сервер не видит, поэтому разбирает
 * его браузер, — см. `app/(auth)/callback/route.ts` и `lib/callback-link.ts`.
 */
export default async function CallbackCompletePage({
  searchParams,
}: PageProps<"/callback/complete">) {
  const { next, token_hash: tokenHash, type } = await searchParams;

  return (
    <CompleteCallback
      next={safeNextPath(next)}
      tokenHash={typeof tokenHash === "string" ? tokenHash : null}
      type={typeof type === "string" ? type : null}
    />
  );
}
