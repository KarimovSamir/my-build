import { Module } from '@nestjs/common';

import { OrderStateMachine } from './order-state-machine.js';
import { OrderTransitionService } from './order-transition.service.js';

/**
 * Модуль заказов. Пока в нём только ядро — state-машина и её транзакционная
 * обёртка. Контроллеры и CRUD появятся в Фазе 3, модуль предложений будет
 * ходить в переходы через `OrderTransitionService` (ТЗ §10).
 */
@Module({
  providers: [OrderStateMachine, OrderTransitionService],
  exports: [OrderStateMachine, OrderTransitionService],
})
export class OrdersModule {}
