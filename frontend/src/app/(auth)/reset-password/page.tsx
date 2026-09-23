import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AuthHeader } from "@/components/auth/auth-header";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { DEMO_LOCKED_NOTE } from "@/lib/demo";
import { getHomeHref } from "@/lib/navigation";
import { getSessionClaims } from "@/lib/session.server";

export const metadata = { title: "Новый пароль" };

/**
 * Экран установки нового пароля. Открывается по ссылке из письма — к этому
 * моменту `/callback` уже обменял её на временную сессию.
 */
export default async function ResetPasswordPage() {
  const claims = await getSessionClaims();

  if (!claims) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeader
          title="Ссылка не сработала"
          description="Ссылка для смены пароля действует ограниченное время и только один раз."
        />

        <Button asChild size="xl" className="w-full">
          <Link href="/forgot-password">
            Запросить новую ссылку
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  // Экран открыт любой вошедшей сессии (он же — конец восстановления пароля),
  // поэтому демо-учётку надо остановить и здесь, а не только в настройках.
  if (claims.isDemo) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeader title="Пароль не меняется" description={DEMO_LOCKED_NOTE} />

        <Button asChild size="xl" className="w-full">
          <Link href={getHomeHref(claims.role)}>
            Вернуться в кабинет
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader title="Новый пароль" description="Придумайте пароль, которым будете входить" />
      <ResetPasswordForm />
    </div>
  );
}
