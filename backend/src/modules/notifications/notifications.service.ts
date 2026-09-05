/**
 * Уведомления: чтение, счётчик непрочитанных, отметки о прочтении (ТЗ §5).
 *
 * Здесь ничего не создаётся. Записи пишут те, кто меняет состояние заказа:
 * `OrderStateMachine` через `OrderTransitionService` — вместе с переходом,
 * `OrderWorkflowService` — на файлы и площадь, `OrdersService` — на удаление
 * заказа. Второе место создания означало бы уведомление вне транзакции
 * перехода, чего ТЗ §8 прямо не допускает.
 *
 * Владение проверяется здесь, а не guard'ом: `OwnershipGuard` ищет по `:id`
 * заказ, а тут `:id` — уведомление. Чужое уведомление отдаёт 404, а не 403:
 * 403 подтвердил бы, что такая строка существует.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MarkedRead,
  NotificationDto,
  Paginated,
  UnreadCount,
} from '@mybuild/shared';

import { pageRequest, toPage } from '../../common/pagination.js';
import { isUuid } from '../../common/uuid.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { toNotificationDto } from './notification-view.js';

const NOT_FOUND = 'Уведомление не найдено';

/**
 * Непрочитанные сверху, внутри группы — новые первыми.
 *
 * Сортировка живёт на сервере, а не в интерфейсе: список постраничный,
 * и «непрочитанные сверху» (ТЗ §10, подфаза 5.4) внутри одной страницы
 * означало бы, что непрочитанное со второй страницы так и осталось внизу.
 * Порядок совпадает с индексом `(userId, isRead, createdAt)`.
 */
const ORDER_BY: Prisma.NotificationOrderByWithRelationInput[] = [
  { isRead: 'asc' },
  { createdAt: 'desc' },
];

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Свои уведомления: фильтр по непрочитанным, пагинация (ТЗ §5). */
  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<Paginated<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = { userId };

    // `unread=false` — это «только прочитанные», а не «фильтра нет»:
    // отсутствие фильтра выражается отсутствием параметра.
    const unreadOnly = query.unreadOnly;

    if (unreadOnly !== undefined) {
      where.isRead = !unreadOnly;
    }

    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: ORDER_BY,
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(rows.map(toNotificationDto), request, total);
  }

  /** Счётчик для колокольчика (ТЗ §5). */
  async unreadCount(userId: string): Promise<UnreadCount> {
    return {
      count: await this.prisma.notification.count({ where: { userId, isRead: false } }),
    };
  }

  /**
   * Пометить одно уведомление прочитанным.
   *
   * `updateMany` с `userId` в условии, а не `findFirst` + `update`: чужая
   * строка не должна ни обновляться, ни подтверждать своё существование
   * отдельным ответом. Повторный вызов на уже прочитанном — не ошибка:
   * состояние то же, значит и ответ тот же.
   */
  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    // Колонка типа `uuid`: мусор в идентификаторе упал бы в Postgres,
    // то есть ушёл бы наружу как 500 вместо 404.
    if (!isUuid(notificationId)) {
      throw new NotFoundException(NOT_FOUND);
    }

    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    if (count === 0) {
      throw new NotFoundException(NOT_FOUND);
    }

    const row = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }

    return toNotificationDto(row);
  }

  /** «Прочитать все». Возвращает, сколько строк это действительно задело. */
  async markAllRead(userId: string): Promise<MarkedRead> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { marked: count };
  }
}
