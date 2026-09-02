import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Уведомления" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Уведомления"
        description="События по вашим заказам"
      />
      <ComingSoon phase="Фазе 5">
        Лента уведомлений с непрочитанными сверху и переходом к заказу
      </ComingSoon>
    </>
  );
}
