import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { contractorsHref } from "@/lib/contractors-filter";

/**
 * Компания не найдена.
 *
 * Один экран на два случая: такой компании нет вовсе и по этому адресу лежит
 * клиент, а не подрядчик. Backend их тоже не разделяет — каталог отвечает 404
 * на всё, чего в нём нет.
 */
export default function ContractorNotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div>
          <p className="font-medium">Подрядчик не найден</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Возможно, компания удалила профиль или ссылка ведёт не туда.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href={contractorsHref()}>
            <ArrowLeft className="size-4" aria-hidden />К каталогу подрядчиков
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
