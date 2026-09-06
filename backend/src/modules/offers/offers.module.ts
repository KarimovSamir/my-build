import { Module } from '@nestjs/common';

import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { OrdersModule } from '../orders/orders.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CompanyController } from './company.controller.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

/**
 * Предложения компаний (ТЗ §5).
 *
 * `OrdersModule` импортируется ради `OrderTransitionService`: все переходы
 * идут через него, и второго места, где статусы попадают в базу, быть не должно.
 *
 * `ThrottleGuard` объявлен провайдером здесь же — экземпляр один на модуль,
 * то есть счётчик частоты общий для всех маршрутов предложений.
 */
@Module({
  imports: [OrdersModule, RealtimeModule],
  controllers: [OffersController, CompanyController],
  providers: [OffersService, ThrottleGuard],
})
export class OffersModule {}
