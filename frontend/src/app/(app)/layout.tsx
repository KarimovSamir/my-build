import type { UnreadCount } from "@/lib/types";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { UnreadProvider } from "@/components/notifications/unread-provider";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { serverApi } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/session.server";

/**
 * Каркас кабинета: боковое меню + шапка + область контента (ТЗ §7).
 *
 * Layout один на обе роли, а не два отдельных: в Next.js две группы роутов
 * не могут объявлять одинаковые пути, а разделы `/orders/[id]`, `/documents`,
 * `/notifications` и `/settings` общие для клиента и компании. Различия ролей
 * живут в составе меню (`lib/navigation.ts`).
 *
 * Подключение к WebSocket-шлюзу открывается здесь и живёт, пока открыт
 * кабинет (ТЗ §8): переходы между страницами меняют подписку на комнаты,
 * а не само соединение. Здесь же — счётчик непрочитанных: колокольчик стоит
 * в шапке, а помечают прочитанным в разделе, и общее у них только это место.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Без сессии `getCurrentUser` уводит на вход. Это удобство, а не защита:
  // права проверяет backend, а до рендера — proxy.ts.
  const user = await getCurrentUser();
  const unreadCount = await getUnreadCount();

  return (
    <RealtimeProvider>
      <UnreadProvider count={unreadCount}>
        <div className="flex min-h-screen">
          <AppSidebar user={user} />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader user={user} />
            <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                {children}
              </div>
            </main>
          </div>
        </div>
      </UnreadProvider>
    </RealtimeProvider>
  );
}

/**
 * Счётчик непрочитанных на момент рендера (ТЗ §5).
 *
 * Отказ запроса гасится намеренно: значок над колокольчиком — украшение шапки,
 * и из-за него кабинет не должен уходить в границу ошибок. Настоящую поломку
 * покажет сама страница, которая за данными и пришла.
 */
async function getUnreadCount(): Promise<number> {
  try {
    const { count } = await serverApi.get<UnreadCount>("/notifications/unread-count");

    return count;
  } catch {
    return 0;
  }
}
