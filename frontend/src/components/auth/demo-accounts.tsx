"use client";

import { LogIn, Sparkles } from "lucide-react";

import { DEMO_ACCOUNTS, DEMO_PASSWORD, Role, roleLabels, type DemoAccount } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <section className="border-border bg-muted/40 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="text-primary size-4 shrink-0" aria-hidden />
          Демо-доступ
        </h2>
        <p className="text-muted-foreground text-xs">
          Войдите готовым аккаунтом и посмотрите приложение с данными —
          регистрация для этого не нужна. Пароль у всех:{" "}
          <code className="bg-background rounded px-1 py-0.5 font-mono text-[11px]">
            {DEMO_PASSWORD}
          </code>
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.email}
            className="border-border bg-background flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{account.title}</span>
                <Badge variant={account.role === Role.CLIENT ? "default" : "secondary"}>
                  {roleLabels[account.role]}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {account.hint}
              </span>
              {/* Адрес показан не для красоты: по нему демо-вход можно
                  повторить руками — например, во втором браузере, чтобы
                  увидеть обновления в реальном времени. */}
              <span className="text-muted-foreground/80 mt-0.5 block truncate font-mono text-[11px]">
                {account.email}
              </span>
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onPick(account)}
            >
              <LogIn className="size-4" aria-hidden />
              Войти
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
