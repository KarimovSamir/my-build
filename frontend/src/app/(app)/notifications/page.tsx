import { Suspense } from "react";

import { CardListSkeleton } from "@/components/list-parts";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PageHeader } from "@/components/page-shell";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { StatusTabs } from "@/components/status-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { NOTIFICATIONS_EVENTS } from "@/lib/live-updates";
import {
  notificationsFilterKey,
  notificationsHref,
  parseNotificationsFilter,
} from "@/lib/notifications-filter";

export const metadata = { title: "Уведомления" };

/** Уведомления: непрочитанные сверху, «Прочитать все», клик → заказ (ТЗ §7). */
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const filter = parseNotificationsFilter(await searchParams);

  return (
    <>
      {/* Новое уведомление приходит в личную комнату пользователя (ТЗ §8) —
          список пополняется сам, не дожидаясь перезагрузки. */}
      <LiveRefresh events={NOTIFICATIONS_EVENTS} />

      <PageHeader
        title="Уведомления"
        description="События по вашим заказам"
        action={<MarkAllReadButton />}
      />

      <Card>
        <CardContent>
          <StatusTabs
            label="Фильтр уведомлений"
            tabs={[
              {
                label: "Все",
                href: notificationsHref(),
                active: !filter.unread,
              },
              {
                label: "Непрочитанные",
                href: notificationsHref({ unread: true }),
                active: filter.unread,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Suspense key={notificationsFilterKey(filter)} fallback={<CardListSkeleton />}>
        <NotificationsList filter={filter} />
      </Suspense>
    </>
  );
}
