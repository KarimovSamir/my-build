import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';

import type {
  OrderAccessContext,
  RequestWithOrderAccess,
} from '../guards/ownership.guard.js';

export const ORDER_ACCESS_KEY = 'mybuild:orderAccess';

/** Насколько близко к заказу нужно стоять, чтобы маршрут пустил (ТЗ §4.1, §6). */
export const OrderAccessMode = {
  /** Только клиент — владелец заказа. Всем остальным заказ «не найден». */
  OWNER: 'OWNER',
  /** Владелец либо любая компания: что именно она увидит, решает `order-view`. */
  VIEWER: 'VIEWER',
  /**
   * Только компания-исполнитель — та, чьё предложение приняли. Клиент сюда
   * не проходит: это маршруты, которые может дёрнуть лишь тот, кто работу
   * делает (сдача, файлы сдачи, уточнение площади — ТЗ §4.1).
   */
  EXECUTOR: 'EXECUTOR',
} as const;
export type OrderAccessMode = (typeof OrderAccessMode)[keyof typeof OrderAccessMode];

/**
 * Требование к доступу для маршрута с параметром `:id` (заказ).
 * Работает только вместе с `@UseGuards(OwnershipGuard)`.
 */
export const OrderAccess = (mode: OrderAccessMode) => SetMetadata(ORDER_ACCESS_KEY, mode);

/**
 * Заказ, уже найденный и проверенный `OwnershipGuard`.
 *
 * Нужен, чтобы сервис не повторял тот же запрос к базе: база managed,
 * и лишний поход по сети на каждый просмотр заказа заметен.
 */
export const OrderAccessCtx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrderAccessContext => {
    const request = context.switchToHttp().getRequest<RequestWithOrderAccess>();

    if (!request.orderAccess) {
      throw new InternalServerErrorException(
        'Маршрут запрашивает заказ, но не защищён OwnershipGuard',
      );
    }

    return request.orderAccess;
  },
);
