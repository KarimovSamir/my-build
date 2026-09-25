"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signOutScope } from "@/lib/demo";
import { readDemoClaim } from "@/lib/session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Выход из аккаунта.
 *
 * Обычная учётка выходит на всех устройствах (ТЗ §5): для общего компьютера
 * это ожидаемое поведение кнопки «выйти». Общая демо-учётка — только на этом,
 * иначе выход одного посетителя выкидывал бы остальных (`signOutScope`).
 * Флаг демо читается из сессии этой вкладки: он лежит в `app_metadata`,
 * которую пишет только ключ сервера.
 *
 * В шапке кабинета это иконка, а на служебных экранах — обычная кнопка
 * с подписью: там она единственное осмысленное действие, и прятать её
 * под иконку нельзя.
 */
export function SignOutButton({ label, className }: { label?: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    const auth = getSupabaseBrowserClient().auth;
    const { data } = await auth.getSession();

    await auth.signOut({
      scope: signOutScope(readDemoClaim(data.session?.user.app_metadata)),
    });
    router.replace("/login");
    router.refresh();
  }

  if (label) {
    return (
      <Button
        variant="outline"
        size="xl"
        onClick={signOut}
        disabled={pending}
        className={cn("w-full", className)}
      >
        <LogOut className="size-4" />
        {label}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={signOut}
      disabled={pending}
      aria-label="Выйти"
      title="Выйти"
      className={className}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
