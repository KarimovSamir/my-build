import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Доступные заказы" };

export default function AvailableOrdersPage() {
  return (
    <>
      <PageHeader
        title="Доступные заказы"
        description="Заказы, по которым вы ещё не отправляли предложение"
      />
      <ComingSoon phase="Фазе 4">
        Лента заказов с бюджетом клиента и формой отправки предложения
      </ComingSoon>
    </>
  );
}
