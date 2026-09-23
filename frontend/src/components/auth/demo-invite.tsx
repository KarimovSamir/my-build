import { ArrowRight } from "lucide-react";
import Link from "next/link";

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
    <section
      aria-labelledby="demo-invite"
      className="border-border bg-brand-surface flex flex-col gap-2 rounded-xl border border-l-[3px] border-l-primary px-4.5 py-4"
    >
      <h2
        id="demo-invite"
        className="text-primary font-mono text-[11px] font-normal tracking-[0.12em] uppercase"
      >
        Просто посмотреть?
      </h2>

      <p className="text-secondary-foreground text-[0.9rem] leading-relaxed">
        На странице входа есть готовые аккаунты клиента и компаний — с заказами,
        предложениями и уведомлениями. Новая учётная запись открывается пустой.
      </p>

      <Link
        href="/login"
        className="text-primary focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-[0.9rem] font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Войти в демо-аккаунт
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
