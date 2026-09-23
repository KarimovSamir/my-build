"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUnread } from "@/components/notifications/unread-provider";
import type { Role } from "@/lib/types";
import { getNavigation, isNavItemActive } from "@/lib/navigation";
import { formatUnreadCount } from "@/lib/notification-view";
import { cn } from "@/lib/utils";

/**
 * Пункты бокового меню с подсветкой активного раздела.
 *
 * Конфиг меню импортируется здесь, а не приходит пропсом: он содержит
 * компоненты иконок, а их нельзя передать из серверного компонента
 * в клиентский. Сверху приходит только роль — обычная строка.
 *
 * Число непрочитанных рядом с «Уведомлениями» берётся из того же
 * `UnreadProvider`, что и колокольчик в шапке: два места с разным числом
 * выглядели бы поломкой.
 */
export function SidebarNav({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = getNavigation(role);
  const { count } = useUnread();
  const unread = formatUnreadCount(count);

  return (
    <nav className="flex flex-col gap-1.5">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className="flex flex-col gap-0.5">
          {section.title ? (
            <p className="text-sidebar-muted-foreground font-mono px-6 pt-6 pb-2.5 text-[0.6875rem] tracking-[0.12em] uppercase">
              {section.title}
            </p>
          ) : null}

          {section.items.map((item) => {
            const active = isNavItemActive(item.href, pathname, role);
            const Icon = item.icon;
            const badge = item.href === "/notifications" ? unread : null;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 px-6 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground font-medium",
                )}
              >
                {active ? (
                  <span className="bg-sidebar-primary absolute inset-y-0 left-0 w-[3px]" aria-hidden />
                ) : null}
                <Icon
                  className={cn(
                    "size-[1.1875rem] shrink-0",
                    active ? "text-sidebar-primary" : "text-sidebar-muted-foreground",
                  )}
                  aria-hidden
                />
                {item.label}

                {badge ? (
                  // Число уже озвучено колокольчиком в шапке — здесь оно
                  // только для глаза, поэтому от читалки спрятано.
                  <span
                    aria-hidden
                    className="bg-primary text-primary-foreground font-mono ml-auto flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[0.6875rem] leading-none"
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
