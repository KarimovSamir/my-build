import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Создать заказ" };

export default function NewOrderPage() {
  return (
    <>
      <PageHeader
        title="Создать заказ"
        description="Опишите проект — компании пришлют предложения с ценой и сроком"
      />
      <ComingSoon phase="Фазе 3">
        Форма в две колонки: детали проекта и файлы слева, бюджет и локация справа
      </ComingSoon>
    </>
  );
}
