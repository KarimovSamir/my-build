import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CurrentUserPreview } from "@/lib/session";

/**
 * Содержимое бокового меню: логотип сверху, разделы в середине,
 * карточка пользователя снизу (ТЗ §7).
 *
 * Вынесено отдельно, потому что используется дважды: как постоянная колонка
 * на десктопе и как выезжающая панель на мобильном.
 */
export function SidebarContent({
  user,
  onNavigate,
}: {
  user: CurrentUserPreview;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Logo href="/" />
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav role={user.role} onNavigate={onNavigate} />
      </div>

      <div className="border-border flex shrink-0 items-center gap-3 border-t px-6 py-4">
        <Avatar className="size-10">
          <AvatarFallback className="bg-primary text-primary-foreground font-medium">
            {user.initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="text-muted-foreground truncate text-xs">{user.roleLabel}</p>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: CurrentUserPreview }) {
  return (
    <aside className="bg-sidebar border-border hidden w-64 shrink-0 border-r lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarContent user={user} />
      </div>
    </aside>
  );
}
