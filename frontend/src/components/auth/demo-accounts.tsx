"use client";

import { DEMO_ACCOUNTS, DEMO_PASSWORD, Role, roleLabels, type DemoAccount } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { companyInitial, personInitial } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Демо-доступ на экране входа.
 *
 * Проект развёрнут как демо портфолио: посетитель пришёл посмотреть продукт,
 * а не заводить учётную запись. Поэтому вход одной кнопкой — иначе экран
 * входа становится стеной между ним и приложением.
 *
 * Список и пароль берутся из `shared/` — оттуда же их берёт `prisma/seed.ts`,
 * так что кнопка обещает ровно ту учётку, которую он и создал.
 */
export function DemoAccounts({
  onPick,
  pending,
}: {
  onPick: (account: DemoAccount) => void;
  /** Вход уже идёт — своей или чужой кнопкой. */
  pending: boolean;
}) {
  return (
    <section aria-labelledby="demo-access" className="flex flex-col gap-4.5">
      <div className="flex items-center gap-3.5">
        <span className="bg-border h-px flex-1" aria-hidden />
        <h2
          id="demo-access"
          className="text-muted-foreground font-mono text-[11px] font-normal tracking-[0.12em] uppercase"
        >
          Демо-доступ
        </h2>
        <span className="bg-border h-px flex-1" aria-hidden />
      </div>

      <p className="text-secondary-foreground text-[0.9rem] leading-relaxed">
        Регистрироваться не нужно: нажмите на любой аккаунт — форма заполнится
        и вход произойдёт сразу.
      </p>

      <ul className="flex flex-col gap-2.5">
        {DEMO_ACCOUNTS.map((account) => {
          const isClient = account.role === Role.CLIENT;

          return (
            <li
              key={account.email}
              className="border-border bg-brand-surface flex items-center gap-3.5 rounded-xl border px-4 py-3.5"
            >
              <span
                className={cn(
                  "font-heading flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold",
                  isClient ? "bg-accent text-primary" : "bg-secondary text-muted-foreground",
                )}
                aria-hidden
              >
                {isClient ? personInitial(account.title) : companyInitial(account.title)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[0.9rem] font-semibold">
                  {roleLabels[account.role]} — {account.title}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-[0.8125rem] leading-snug">
                  {account.hint}
                </span>
                {/* Адрес показан не для красоты: по нему демо-вход можно
                    повторить руками — например, во втором браузере, чтобы
                    увидеть обновления в реальном времени. Поэтому на узком
                    экране он переносится, а не обрезается. */}
                <span className="text-muted-foreground mt-1 block font-mono text-xs break-all">
                  {account.email}
                </span>
              </span>

              {/* `bg-foreground`, а не `--brand-ink` макета: чернильная плашка
                  в тёмной теме сливается с карточкой (то же решение, что
                  у выбранной вкладки статусов). */}
              <Button
                type="button"
                disabled={pending}
                onClick={() => onPick(account)}
                aria-label={`Войти: ${roleLabels[account.role]} — ${account.title}`}
                className="bg-foreground text-background hover:bg-foreground/85 h-9 px-4"
              >
                Войти
              </Button>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground font-mono text-xs">
        Пароль у всех демо-аккаунтов: {DEMO_PASSWORD}
      </p>
    </section>
  );
}
