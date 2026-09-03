import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import {
  THROTTLE_KEY,
  type ThrottleOptions,
} from '../decorators/throttle.decorator.js';
import type { RequestWithUser } from '../../modules/auth/auth-user.js';

/**
 * Ограничение частоты запросов на мутирующих маршрутах (ТЗ §6).
 *
 * Своя реализация вместо `@nestjs/throttler`: последняя версия библиотеки
 * (6.5.0) объявляет peer-зависимость только до NestJS 11, и на NestJS 12,
 * который выбран в Фазе 0, npm её не ставит. Механизм здесь тот же —
 * скользящее окно на пользователя и маршрут, — а зависимости нет.
 *
 * Ограничения этой реализации, важные к Фазе 7:
 * - счётчики живут в памяти процесса, поэтому при нескольких экземплярах
 *   backend'а лимит окажется общим только внутри каждого из них;
 * - ключом для анонимных запросов служит IP, а за обратным прокси (Railway,
 *   Render) для настоящего адреса нужен `app.set('trust proxy', 1)`.
 */

/** Если у маршрута нет своих значений: 20 запросов в минуту. */
const DEFAULT_THROTTLE: ThrottleOptions = { limit: 20, ttl: 60_000 };

/** Как часто выбрасывать из памяти окна, по которым давно нет запросов. */
const SWEEP_INTERVAL_MS = 60_000;

interface RequestWindow {
  /** Метки времени запросов внутри окна, от старой к новой. */
  stamps: number[];
  /** Когда это окно перестанет иметь значение и его можно удалить. */
  expiresAt: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly windows = new Map<string, RequestWindow>();
  private nextSweepAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options =
      this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_THROTTLE;

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();

    const now = Date.now();
    this.sweep(now);

    const key = buildKey(context, request);
    const windowStart = now - options.ttl;
    const stamps = (this.windows.get(key)?.stamps ?? []).filter(
      (stamp) => stamp > windowStart,
    );

    if (stamps.length >= options.limit) {
      // Окно освободится, когда из него выпадет самый старый запрос.
      const retryAfter = Math.max(1, Math.ceil((stamps[0]! + options.ttl - now) / 1000));
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Слишком много запросов. Повторите через ${retryAfter} с`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    stamps.push(now);
    this.windows.set(key, { stamps, expiresAt: now + options.ttl });

    return true;
  }

  /**
   * Убрать окна, срок которых истёк. Иначе карта растёт на каждого
   * пользователя и не уменьшается никогда.
   */
  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;

    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}

/**
 * Ключ окна: кто и куда стучится.
 *
 * Для вошедшего пользователя это его идентификатор, а не IP: за одним адресом
 * может сидеть целый офис, и лимит по IP наказал бы всех разом.
 */
function buildKey(context: ExecutionContext, request: RequestWithUser): string {
  const who = request.user?.id ?? request.ip ?? 'unknown';
  return `${who}:${context.getClass().name}#${context.getHandler().name}`;
}
