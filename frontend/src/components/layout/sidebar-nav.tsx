"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/lib/types";
import { getNavigation, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Пункты бокового меню с подсветкой активного раздела.
 *
 * Конфиг меню импортируется здесь, а не приходит пропсом: он содержит
 * компоненты иконок, а их нельзя передать из серверного компонента
 * в клиентский. Сверху приходит только роль — обычная строка.
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

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className="flex flex-col gap-1">
          {section.title ? (
            <p className="text-muted-foreground px-6 pb-2 text-xs font-medium tracking-wider uppercase">
              {section.title}
            </p>
          ) : null}

          {section.items.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {active ? (
                  <span className="bg-primary absolute inset-y-0 right-0 w-1 rounded-l" />
                ) : null}
                <Icon className="size-5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
