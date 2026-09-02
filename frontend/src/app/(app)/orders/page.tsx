import { Plus } from "lucide-react";
import Link from "next/link";

import { ComingSoon, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Все заказы" };

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Все заказы"
        description="Управляйте вашими текущими и завершёнными проектами"
        action={
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="size-4" />
              Создать заказ
            </Link>
          </Button>
        }
      />
      <ComingSoon phase="Фазе 3">
        Список заказов с поиском, вкладками по статусам и пагинацией
      </ComingSoon>
    </>
  );
}
