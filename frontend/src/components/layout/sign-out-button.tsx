"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Выход из аккаунта.
 *
 * `scope: 'global'` — сессия закрывается на всех устройствах (ТЗ §5): для
 * общего компьютера это ожидаемое поведение кнопки «выйти».
 *
 * В шапке кабинета это иконка, а на служебных экранах — обычная кнопка
 * с подписью: там она единственное осмысленное действие, и прятать её
 * под иконку нельзя.
 */
export function SignOutButton({ label }: { label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
    router.replace("/login");
    router.refresh();
  }

  if (label) {
    return (
      <Button variant="outline" onClick={signOut} disabled={pending} className="w-full">
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
    >
      <LogOut className="size-4" />
    </Button>
  );
}
