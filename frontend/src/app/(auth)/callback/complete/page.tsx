import { CompleteCallback } from "@/components/auth/complete-callback";
import { Card, CardContent } from "@/components/ui/card";
import { safeNextPath } from "@/lib/redirects";

export const metadata = { title: "Подтверждение" };

/**
 * Промежуточный экран для ссылок, которые приносят токены во фрагменте
 * (`#access_token=…`). Сервер фрагмент не видит, поэтому разбирает его
 * браузер — см. `app/(auth)/callback/route.ts`.
 */
export default async function CallbackCompletePage({
  searchParams,
}: PageProps<"/callback/complete">) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardContent className="py-10">
        <CompleteCallback next={safeNextPath(next)} />
      </CardContent>
    </Card>
  );
}
