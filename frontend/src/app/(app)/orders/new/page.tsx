import { NewOrderForm } from "@/components/orders/new-order-form";
import { PageHeader } from "@/components/page-shell";

export const metadata = { title: "Создать заказ" };

export default function NewOrderPage() {
  return (
    <>
      <PageHeader
        title="Создать заказ"
        description="Опишите работы один раз — дальше компании присылают цену и срок"
      />
      <NewOrderForm />
    </>
  );
}
