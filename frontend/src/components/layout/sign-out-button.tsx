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
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
    router.replace("/login");
    router.refresh();
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
