import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Настройки"
        description="Профиль и безопасность"
      />
      <ComingSoon phase="Фазе 6">
        Имя, телефон, город, название компании и смена пароля
      </ComingSoon>
    </>
  );
}
