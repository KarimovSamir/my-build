import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type {
  MarkedRead,
  NotificationDto,
  Paginated,
  UnreadCount,
} from '@mybuild/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Уведомления (ТЗ §5). Все четыре маршрута открыты обеим ролям и работают
 * только со своими записями — фильтр по `userId` живёт в сервисе.
 *
 * `@Roles` здесь нет намеренно: ограничивать нечего, а глобальный
 * `SupabaseAuthGuard` уже требует токен — маршрут без `@Public()` закрыт.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Свои уведомления: непрочитанные сверху, постранично. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(user.id, query);
  }

  /**
   * Счётчик для колокольчика. Объявлен до маршрутов с параметром не по
   * необходимости, а по порядку чтения: `:id` здесь только у POST.
   */
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  /** Пометить уведомление прочитанным. */
  @Post(':id/read')
  @UseGuards(ThrottleGuard)
  // Колокольчик помечает по одному, а страница уведомлений — подряд:
  // лимит выше, чем у мутаций заказа, иначе он сработал бы на обычной работе.
  @Throttle({ limit: 120, ttl: 60_000 })
  // Ничего не создаётся — 200, а не принятый в Nest по умолчанию 201.
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(user.id, id);
  }

  /** Пометить все свои уведомления прочитанными. */
  @Post('read-all')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthUser): Promise<MarkedRead> {
    return this.notifications.markAllRead(user.id);
  }
}
