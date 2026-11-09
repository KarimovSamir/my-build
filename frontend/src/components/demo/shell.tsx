"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { DemoGate, useDemo } from "./provider";
import { chooseActor, resetDemo } from "@/lib/demo/store";
import { toCurrentUser } from "@/lib/session";
import { getHomeHref } from "@/lib/navigation";

export function DemoShell({ children }: { children: ReactNode }) {
  const { state, actorId } = useDemo();
  const actor = state?.users.find((u) => u.id === actorId);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (state && !actor) router.replace("/login/"); }, [state, actor, router]);
  return <DemoGate>{actor ? <div className="flex min-h-screen">
    <AppSidebar user={toCurrentUser(actor)} />
    <div className="flex min-w-0 flex-1 flex-col">
      <AppHeader user={toCurrentUser(actor)} />
      <div className="bg-accent/40 border-border flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-10">
        <p className="text-muted-foreground flex-1 text-xs">Демонстрационная версия. Изменения сохраняются только в этом браузере.</p>
        <label className="flex items-center gap-2 text-sm">Демо-профиль
          <select aria-label="Демо-профиль" value={actor.id} className="bg-background border-border max-w-52 rounded-md border p-2"
            onChange={(event) => {
              const next = state!.users.find((u) => u.id === event.target.value)!;
              chooseActor(next.id);
              if (!pathname.startsWith("/orders/view")) router.push(getHomeHref(next.role));
            }}>
            {state!.users.map((u) => <option key={u.id} value={u.id}>{u.companyName ?? `${u.firstName} ${u.lastName}`}</option>)}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => {
          if (window.confirm("Удалить все локальные изменения и начать демо заново?")) void resetDemo();
        }}>Начать заново</Button>
      </div>
      <main className="flex-1 px-4 py-6 lg:px-10 lg:py-8"><div key={`${state!.generation}:${actor.id}`} className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div></main>
    </div>
  </div> : <p className="p-6"><Link href="/login/">Выбрать профиль</Link></p>}</DemoGate>;
}
