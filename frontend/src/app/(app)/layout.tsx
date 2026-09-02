import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getPreviewUser } from "@/lib/session";
import { getPreviewRole } from "@/lib/session.server";

/**
 * Каркас кабинета: боковое меню + шапка + область контента (ТЗ §7).
 *
 * Layout один на обе роли, а не два отдельных: в Next.js две группы роутов
 * не могут объявлять одинаковые пути, а разделы `/orders/[id]`, `/documents`,
 * `/notifications` и `/settings` общие для клиента и компании. Различия ролей
 * живут в составе меню (`lib/navigation.ts`).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const role = await getPreviewRole();
  const user = getPreviewUser(role);

  return (
    <div className="flex min-h-screen">
      <AppSidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
