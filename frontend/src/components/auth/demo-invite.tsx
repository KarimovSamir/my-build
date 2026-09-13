import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Приглашение в демо на экране регистрации.
 *
 * Заводить учётную запись ради того, чтобы посмотреть продукт, посетитель не
 * обязан — и, главное, новый аккаунт открывается пустым: ни заказов, ни
 * предложений, ни уведомлений. Демо-аккаунты живут на экране входа, здесь
 * только указатель на них: держать список в двух местах незачем.
 */
export function DemoInvite() {
  return (
    <section className="border-border bg-muted/40 flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="text-primary size-4 shrink-0" aria-hidden />
        Просто посмотреть?
      </h2>

      <p className="text-muted-foreground text-xs">
        На странице входа есть готовые демо-аккаунты клиента и компаний —
        с заказами, предложениями и уведомлениями. Новая же учётная запись
        открывается пустой: заказы в ней придётся создавать самому.
      </p>

      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href="/login">
          Войти в демо-аккаунт
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </section>
  );
}
