/**
 * Строка в лог на каждый HTTP-запрос (ТЗ §10, подфаза 7.3).
 *
 * Зачем это на бесплатной площадке. Логи там — единственная обсервабилити,
 * какая есть: ни метрик, ни трассировки. До этого в лог попадали только
 * падения (500) из `AllExceptionsFilter`, поэтому вопрос «почему у клиента
 * пусто на экране» не имел ответа вовсе: 401 после протухшего токена, 403
 * из `RolesGuard` и 429 из `ThrottleGuard` не оставляли следа.
 *
 * Почему middleware, а не интерсептор. Интерсептор работает после guard'ов,
 * то есть ровно те отказы, ради которых всё и заводится, до него не доходят.
 * Middleware видит каждый запрос, а замер по событию `finish` даёт настоящее
 * время ответа, включая сериализацию тела.
 *
 * Что в строку не попадает: строка запроса. В `?q=` лежит то, что пользователь
 * искал — адрес объекта, название компании, — и место этому не в общем логе
 * площадки. Для отладки хватает пути и статуса.
 */

import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { RequestWithUser } from '../modules/auth/auth-user.js';

const logger = new Logger('Request');

/** Маршрут внешнего пингера: раз в несколько минут, круглосуточно. */
const HEALTH_PATH = '/health';

export function requestLoggerMiddleware(
  request: RequestWithUser,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const path = request.originalUrl.split('?')[0];
    const status = response.statusCode;

    // Пользователь появляется в запросе только после `SupabaseAuthGuard`,
    // то есть к моменту `finish` он уже на месте — в отличие от начала запроса.
    const who = request.user?.id ?? 'гость';
    const line = `${request.method} ${path} → ${status} · ${elapsedMs.toFixed(0)} мс · ${who}`;

    if (status >= 500) {
      // Стек к этому моменту уже записан фильтром — здесь только сама строка.
      logger.error(line);
    } else if (status >= 400) {
      logger.warn(line);
    } else if (path === HEALTH_PATH) {
      // Иначе пингер один заполняет собой весь лог, и настоящие запросы
      // приходится искать между его строками.
      logger.debug(line);
    } else {
      logger.log(line);
    }
  });

  next();
}
