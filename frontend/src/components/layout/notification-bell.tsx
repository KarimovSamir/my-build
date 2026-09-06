"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { useUnread } from "@/components/notifications/unread-provider";
import { Button } from "@/components/ui/button";
import { bellLabel, formatUnreadCount } from "@/lib/notification-view";

/**
 * Колокольчик с индикатором непрочитанных (ТЗ §7).
 *
 * Это ссылка в раздел, а не выпадающий список: историю уведомлений показывает
 * `/notifications` — там же вкладки, «Прочитать все» и пагинация. Второй,
 * укороченный список в шапке был бы вторым местом с теми же правилами.
 *
 * Само число живёт в `UnreadProvider`: оно нужно ещё и кнопке «Прочитать все»,
 * и меняться обязано на любом экране кабинета.
 */
export function NotificationBell() {
  const { count } = useUnread();
  const badge = formatUnreadCount(count);

  return (
    <Button
      variant="ghost"
      size="icon"
      asChild
      aria-label={bellLabel(count)}
      className="relative"
    >
      <Link href="/notifications">
        <Bell className="size-5" />

        {badge ? (
          // Число озвучивать нечем — оно уже в `aria-label` самой кнопки.
          <span
            aria-hidden
            className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
          >
            {badge}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
