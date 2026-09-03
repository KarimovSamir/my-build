import { Bell, MapPin } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CurrentUser } from "@/lib/session";

/**
 * Шапка кабинета: крошки слева, колокольчик и город/страна справа (ТЗ §7).
 *
 * Счётчик непрочитанных появится в Фазе 5 вместе с WebSocket — пока точка
 * над колокольчиком не рисуется, чтобы не показывать выдуманные данные.
 */
export function AppHeader({ user }: { user: CurrentUser }) {
  const location = [user.city, user.country].filter(Boolean).join(", ");

  return (
    <header className="bg-background/80 border-border sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur lg:px-8">
      <MobileSidebar user={user} />

      <div className="min-w-0 flex-1">
        <Breadcrumbs role={user.role} />
      </div>

      <ThemeToggle />

      <Button variant="ghost" size="icon" asChild aria-label="Уведомления">
        <Link href="/notifications">
          <Bell className="size-5" />
        </Link>
      </Button>

      {location ? (
        <>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="text-muted-foreground hidden items-center gap-1.5 text-sm sm:flex">
            <MapPin className="size-4" aria-hidden />
            {location}
          </div>
        </>
      ) : null}
    </header>
  );
}
