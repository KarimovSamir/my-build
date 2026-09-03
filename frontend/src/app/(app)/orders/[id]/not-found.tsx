import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Заказ не найден.
 *
 * Один экран на два случая: заказа нет вовсе и заказ чужой. Backend их тоже
 * не разделяет — 403 подтвердил бы, что заказ с таким идентификатором
 * существует (ТЗ §6).
 */
export default function OrderNotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div>
          <p className="font-medium">Заказ не найден</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Возможно, он удалён или ссылка ведёт на чужой заказ.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/orders">
            <ArrowLeft className="size-4" aria-hidden />К списку заказов
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
