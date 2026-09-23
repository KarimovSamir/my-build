import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CurrentUser } from "@/lib/session";

/**
 * Содержимое бокового меню: логотип сверху, разделы в середине,
 * карточка пользователя снизу (ТЗ §7).
 *
 * Вынесено отдельно, потому что используется дважды: как постоянная колонка
 * на десктопе и как выезжающая панель на мобильном.
 *
 * Меню тёмное в обеих темах — это фирменная полоса, а не «фон в тёмной теме».
 * Все цвета внутри берутся из токенов `--sidebar-*`, поэтому переключение
 * темы его не трогает.
 */
export function SidebarContent({
  user,
  onNavigate,
}: {
  user: CurrentUser;
  onNavigate?: () => void;
}) {
  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      <div className="border-sidebar-border flex h-18 shrink-0 items-center border-b px-6">
        <Logo href="/" tone="ink" />
      </div>

      <div className="flex-1 overflow-y-auto py-5">
        <SidebarNav role={user.role} onNavigate={onNavigate} />
      </div>

      <div className="border-sidebar-border flex shrink-0 items-center gap-3 border-t px-6 py-4">
        <Avatar className="size-10">
          <AvatarFallback className="bg-primary text-primary-foreground font-heading font-semibold">
            {user.initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sidebar-accent-foreground truncate text-sm font-semibold">
            {user.displayName}
          </p>
          <p className="text-sidebar-muted-foreground truncate text-xs">{user.roleLabel}</p>
        </div>
        <SignOutButton className="text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: CurrentUser }) {
  return (
    <aside className="hidden w-66 shrink-0 lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarContent user={user} />
      </div>
    </aside>
  );
}
