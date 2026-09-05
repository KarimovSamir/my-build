/**
 * Строка `Notification` → ответ API (ТЗ §5).
 *
 * Чистая функция в отдельном файле по той же причине, что и `order-view`:
 * состав ответа — это контракт, и он должен проверяться тестом без базы.
 */

import type { NotificationDto, NotificationType } from '@mybuild/shared';

/** Поля строки, из которых собирается ответ. */
export interface NotificationRow {
  id: string;
  type: NotificationType;
  orderId: string | null;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: Date;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    // Заказа может уже не быть: уведомление об удалении переживает его
    // (`onDelete: SetNull`), и ссылки у такой строки нет.
    orderId: row.orderId,
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}
