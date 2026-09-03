import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>Ссылка не сработала</CardTitle>
          <CardDescription>
            Ссылка для смены пароля действует ограниченное время и только один раз.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href="/forgot-password" className="text-primary font-medium hover:underline">
            Запросить новую ссылку
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый пароль</CardTitle>
        <CardDescription>Придумайте пароль, которым будете входить</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
