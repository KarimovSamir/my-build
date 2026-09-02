import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Мои предложения" };

export default function OffersPage() {
  return (
    <>
      <PageHeader
        title="Мои предложения"
        description="Отправленные предложения по статусам"
      />
      <ComingSoon phase="Фазе 4">
        Список предложений с фильтром по статусу и переходом к заказу
      </ComingSoon>
    </>
  );
}
