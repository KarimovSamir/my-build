import { Module } from '@nestjs/common';

import { OwnershipGuard } from '../../common/guards/ownership.guard.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { FilesModule } from '../files/files.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { OrderStateMachine } from './order-state-machine.js';
import { OrderTransitionService } from './order-transition.service.js';
import { OrderWorkflowController } from './order-workflow.controller.js';
import { OrderWorkflowService } from './order-workflow.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

/**
 * Заказы: CRUD клиента (ТЗ §5) плюс ядро переходов, которым в Фазе 4
 * воспользуется модуль предложений.
 *
 * `OwnershipGuard` и `ThrottleGuard` объявлены провайдерами: они висят
 * на отдельных маршрутах через `@UseGuards`, и Nest берёт их экземпляры
 * из этого модуля. Экземпляр один на модуль — счётчик частоты запросов
 * общий для всех маршрутов контроллера, как и должно быть.
 */
@Module({
  imports: [FilesModule, RealtimeModule],
  controllers: [OrdersController, OrderWorkflowController],
  providers: [
    OrderStateMachine,
    OrderTransitionService,
    OrdersService,
    OrderWorkflowService,
    OwnershipGuard,
    ThrottleGuard,
  ],
  exports: [OrderStateMachine, OrderTransitionService],
})
export class OrdersModule {}
