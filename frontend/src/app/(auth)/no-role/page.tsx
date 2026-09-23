import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth/auth-header";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getSessionClaims } from "@/lib/session.server";

export const metadata = { title: "Роль не определена" };

/**
 * Вход выполнен, но в токене нет claim'а `user_role` (ТЗ §6).
 *
 * Это поломка настройки проекта Supabase, а не действие пользователя: без роли
 * кабинета для него не существует — backend отвечает 403 на любой ролевой
 * маршрут. Экран называет причину прямо, иначе отладка занимает час.
 */
export default async function NoRolePage() {
  const claims = await getSessionClaims();

  if (!claims) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader title="Роль не определена" description="Кабинет открыть не получится" />

      <div className="text-secondary-foreground flex flex-col gap-4 text-[0.95rem] leading-relaxed">
        <p>
          Вход выполнен, но в токене нет роли — клиент вы или строительная
          компания. Разделы кабинета у этих ролей разные, поэтому показать
          нечего.
        </p>
        <p>
          Это ошибка настройки сервиса, а не вашей учётной записи. Если вы
          администратор проекта: включите{" "}
          <strong className="text-foreground">Custom Access Token Hook</strong>{" "}
          (функция <code className="font-mono text-[0.85rem] break-all">public.custom_access_token_hook</code>)
          в панели Supabase — Authentication → Hooks.
        </p>
      </div>

      <SignOutButton label="Выйти" />
    </div>
  );
}
