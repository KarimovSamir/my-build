"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { PREVIEW_ROLE_COOKIE } from "@/lib/session";
import type { Role } from "@mybuild/shared";

/**
 * Переключатель роли для предпросмотра каркаса.
 *
 * Только для разработки: до Фазы 2 настоящей авторизации нет, а посмотреть
 * оба кабинета надо. Меняет cookie и перерисовывает страницу.
 * Удаляется вместе с появлением реальной сессии Supabase.
 */
export function RolePreviewSwitch({ role }: { role: Role }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Role) {
    document.cookie = `${PREVIEW_ROLE_COOKIE}=${next}; path=/; max-age=2592000; samesite=lax`;
    startTransition(() => {
      router.replace(next === "COMPANY" ? "/available" : "/orders");
      router.refresh();
    });
  }

  return (
    <div className="border-border hidden items-center gap-1 rounded-lg border p-0.5 md:flex">
      <Button
        size="sm"
        variant={role === "CLIENT" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs"
        disabled={pending}
        onClick={() => switchTo("CLIENT")}
      >
        Клиент
      </Button>
      <Button
        size="sm"
        variant={role === "COMPANY" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs"
        disabled={pending}
        onClick={() => switchTo("COMPANY")}
      >
        Компания
      </Button>
    </div>
  );
}
