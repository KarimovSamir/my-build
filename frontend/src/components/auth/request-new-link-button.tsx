"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * «Запросить новую ссылку» для того, у кого уже есть сессия.
 *
 * Простой ссылкой на `/forgot-password` не обойтись: экран открыт только
 * гостям, и вошедшего `proxy.ts` уведёт с него в кабинет. Поэтому сначала
 * выход — только на этом устройстве, чужие сессии не трогаем.
 */
export function RequestNewLinkButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function requestNewLink() {
    setPending(true);
    await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
    router.replace("/forgot-password");
    router.refresh();
  }

  return (
    <Button size="xl" className="w-full" onClick={requestNewLink} disabled={pending}>
      Запросить новую ссылку
      <ArrowRight aria-hidden />
    </Button>
  );
}
