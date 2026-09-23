import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth/auth-header";
import { SignOutButton } from "@/components/layout/sign-out-button";
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
    <div className="flex flex-col gap-8">
      <AuthHeader
        title="Подтвердите email"
        description="Кабинет откроется после подтверждения адреса"
      />

      <div className="text-secondary-foreground flex flex-col gap-4 text-[0.95rem] leading-relaxed">
        <p>
          Мы отправили письмо со ссылкой
          {claims.email ? (
            <>
              {" "}
              на <strong className="text-foreground font-mono text-[0.9rem] font-medium">{claims.email}</strong>
            </>
          ) : null}
          . Перейдите по ней — и вернитесь сюда.
        </p>
        <p>
          Письма нет? Проверьте папку «Спам». Если письмо не приходит,
          зарегистрируйтесь заново или обратитесь в поддержку.
        </p>
      </div>

      <SignOutButton label="Выйти" />
    </div>
  );
}
