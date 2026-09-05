import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Уведомления (ТЗ §5). Модуль только читает и помечает прочитанным —
 * создаются записи там же, где меняется состояние заказа.
 *
 * `ThrottleGuard` объявлен провайдером здесь: экземпляр один на модуль,
 * то есть счётчик частоты общий для маршрутов уведомлений и не пересекается
 * со счётчиком заказов.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ThrottleGuard],
})
export class NotificationsModule {}
