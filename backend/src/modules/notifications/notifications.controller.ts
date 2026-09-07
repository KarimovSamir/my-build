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
 *
 * `ThrottleGuard` стоит на контроллере целиком, включая чтение: счётчик
 * непрочитанных дёргается на каждое событие сокета и на каждый рендер каркаса,
 * то есть это самый частый маршрут API, и оставлять его без потолка нельзя
 * (ТЗ §6). Лимиты у каждого маршрута свои — общий на всех штрафовал бы
 * обычную работу.
 */
@Controller('notifications')
@UseGuards(ThrottleGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Свои уведомления: непрочитанные сверху, постранично. */
  @Get()
  // Список перечитывается на каждое `notification:created` и на каждый переход
  // по страницам — лимит с запасом, но поток «в цикле» упрётся сразу.
  @Throttle({ limit: 120, ttl: 60_000 })
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
  // Самый частый маршрут: его зовёт и каркас на каждом рендере, и провайдер
  // счётчика после каждого события. Отсюда лимит выше остальных.
  @Throttle({ limit: 240, ttl: 60_000 })
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  /** Пометить уведомление прочитанным. */
  @Post(':id/read')
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
  @Throttle({ limit: 30, ttl: 60_000 })
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthUser): Promise<MarkedRead> {
    return this.notifications.markAllRead(user.id);
  }
}
