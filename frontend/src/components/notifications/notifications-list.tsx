import Link from "next/link";

import { type NotificationDto, type Paginated } from "@/lib/types";

import { EmptyCard, OutOfRange, PaginationBar } from "@/components/list-parts";
import { NotificationRow } from "@/components/notifications/notification-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  notificationsHref,
  type NotificationsFilter,
} from "@/lib/notifications-filter";

/**
 * Лента уведомлений (ТЗ §5, §7).
 *
 * Порядок — непрочитанные сверху, внутри группы новые первыми — задаёт
 * backend: список постраничный, и сортировка на фронте оставила бы
 * непрочитанное со второй страницы внизу.
 */
export function NotificationsList({ filter, page }: { filter: NotificationsFilter; page: Paginated<NotificationDto> }) {

  if (page.total === 0) {
    return filter.unread ? (
      <EmptyCard
        title="Непрочитанных уведомлений нет"
        description="Всё прочитано. Новые события по заказам появятся здесь сразу, как произойдут."
      >
        <Button variant="outline" asChild>
          <Link href={notificationsHref()}>Показать все</Link>
        </Button>
      </EmptyCard>
    ) : (
      <EmptyCard
        title="Уведомлений пока нет"
        description="Здесь появятся события по заказам: предложения, сдачи работ и решения по ним."
      />
    );
  }

  return (
    <Card className="gap-0 p-0">
      {page.items.length === 0 ? (
        <OutOfRange
          href={notificationsHref({ unread: filter.unread })}
          label="На этой странице уведомлений нет"
        />
      ) : (
        <ul className="divide-border divide-y">
          {page.items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </ul>
      )}

      <PaginationBar
        shown={page.items.length}
        total={page.total}
        page={filter.page}
        totalPages={page.totalPages}
        hrefFor={(next) => notificationsHref({ ...filter, page: next })}
      />
    </Card>
  );
}
