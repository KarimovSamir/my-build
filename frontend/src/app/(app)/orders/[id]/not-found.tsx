import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getHomeHref } from "@/lib/navigation";
import { getSessionClaims } from "@/lib/session.server";

/**
 * Заказ не найден.
 *
 * Один экран на два случая: заказа нет вовсе и заказ чужой. Backend их тоже
 * не разделяет — 403 подтвердил бы, что заказ с таким идентификатором
 * существует (ТЗ §6).
 *
 * Кнопка ведёт в кабинет роли, а не жёстко на `/orders`: раздела «Все заказы»
 * у компании нет, и `proxy.ts` увёл бы её с него на ленту доступных заказов.
 */
export default async function OrderNotFound() {
  const claims = await getSessionClaims();
  const isCompany = claims?.role === "COMPANY";

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
          <Link href={getHomeHref(claims?.role ?? null)}>
            <ArrowLeft className="size-4" aria-hidden />
            {isCompany ? "К доступным заказам" : "К списку заказов"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
