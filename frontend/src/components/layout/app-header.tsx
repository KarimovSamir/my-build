import { MapPin } from "lucide-react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import type { CurrentUser } from "@/lib/session";

/**
 * Шапка кабинета: крошки слева, колокольчик и город/страна справа (ТЗ §7).
 *
 * Число непрочитанных колокольчик берёт из `UnreadProvider` — оно живёт
 * в каркасе и меняется по событию `notification:created` (ТЗ §8).
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

      <NotificationBell />

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
