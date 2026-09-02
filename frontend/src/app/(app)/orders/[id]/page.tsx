import { formatOrderNumber, parseOrderNumber } from "@mybuild/shared";

import { ComingSoon, PageHeader } from "@/components/page-shell";

export const metadata = { title: "Заказ" };

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const orderNumber = parseOrderNumber(id);

  return (
    <>
      <PageHeader
        title={orderNumber ? formatOrderNumber(orderNumber) : "Заказ"}
        description="Детали заказа, предложения и приёмка работ"
      />
      <ComingSoon phase="Фазе 3">
        Описание, файлы, предложения и действия по текущему статусу
      </ComingSoon>
    </>
  );
}
