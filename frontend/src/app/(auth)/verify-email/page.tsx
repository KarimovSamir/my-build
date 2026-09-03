import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/layout/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionClaims } from "@/lib/session.server";

export const metadata = { title: "Подтвердите email" };

/**
 * Вход выполнен, но адрес не подтверждён (ТЗ §6).
 *
 * Обычно сюда не попадают: Supabase не выдаёт сессию до подтверждения. Экран
 * нужен, когда этот переключатель в панели выключен, — тогда кабинет всё равно
 * закрыт (backend отвечает 403), и пользователь должен понимать почему.
 */
export default async function VerifyEmailPage() {
  const claims = await getSessionClaims();

  if (!claims) {
    redirect("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Подтвердите email</CardTitle>
        <CardDescription>
          Кабинет откроется после подтверждения адреса
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-col gap-4 text-sm">
        <p>
          Мы отправили письмо со ссылкой
          {claims.email ? (
            <>
              {" "}
              на <strong className="text-foreground">{claims.email}</strong>
            </>
          ) : null}
          . Перейдите по ней — и вернитесь сюда.
        </p>
        <p>
          Письма нет? Проверьте папку «Спам». Если письмо не приходит,
          зарегистрируйтесь заново или обратитесь в поддержку.
        </p>

        <SignOutButton label="Выйти" />
      </CardContent>
    </Card>
  );
}
