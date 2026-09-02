import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Подрядчики" };

export default function ContractorsPage() {
  return (
    <>
      <PageHeader
        title="Подрядчики"
        description="Каталог зарегистрированных строительных компаний"
      />
      <ComingSoon phase="Фазе 6">
        Поиск по компаниям и карточка с городом, контактами и числом завершённых заказов
      </ComingSoon>
    </>
  );
}
