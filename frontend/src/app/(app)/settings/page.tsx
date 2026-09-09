import { ComingSoon, PageHeader } from "@/components/page-shell";
import { AccountCard } from "@/components/settings/account-card";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { getCurrentUser } from "@/lib/session.server";

export const metadata = { title: "Настройки" };

/**
 * Настройки: профиль, пароль и место под платежи (ТЗ §7, §11).
 *
 * Раздел общий для обеих ролей — различие только в одном поле формы
 * (название компании) и в подписях. Профиль приходит из `GET /profile`
 * тем же запросом, что читает каркас кабинета: `getCurrentUser` закэширован
 * на рендер, лишнего круга к API страница не делает.
 *
 * Живого обновления здесь нет намеренно: свой профиль меняет только сам
 * пользователь, событий про него в ТЗ §8 не существует.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader title="Настройки" description="Профиль и безопасность" />

      <ProfileForm profile={user} />
      <AccountCard profile={user} />
      <PasswordForm email={user.email} />

      <ComingSoon title="Платежи" phase="одном из следующих релизов">
        Карты и оплата заказов онлайн
      </ComingSoon>
    </>
  );
}
