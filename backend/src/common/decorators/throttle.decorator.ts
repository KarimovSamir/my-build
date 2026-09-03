import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'mybuild:throttle';

/** Сколько запросов и за какое окно разрешено одному пользователю на маршруте. */
export interface ThrottleOptions {
  /** Максимум запросов за окно. */
  limit: number;
  /** Длина окна в миллисекундах. */
  ttl: number;
}

/**
 * Ограничение частоты запросов к маршруту (ТЗ §6).
 *
 * Работает только вместе с `@UseGuards(ThrottleGuard)`: ограничение вешается
 * точечно на мутирующие маршруты, а не глобально, — списки и детали заказа
 * фронт запрашивает часто и по делу.
 */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);
