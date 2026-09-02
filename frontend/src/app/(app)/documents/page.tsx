import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Документы" };

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        title="Документы"
        description="Все файлы по всем вашим заказам в одном списке"
      />
      <ComingSoon phase="Фазе 6">
        Список файлов с фильтрами и скачиванием без захода в заказы
      </ComingSoon>
    </>
  );
}
