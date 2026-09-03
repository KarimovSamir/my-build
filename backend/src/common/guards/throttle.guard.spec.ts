import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THROTTLE_KEY, type ThrottleOptions } from '../decorators/throttle.decorator.js';
import { ThrottleGuard } from './throttle.guard.js';

/**
 * Ограничитель частоты запросов (ТЗ §6). Реализация своя, поэтому проверяется
 * целиком: и что лимит срабатывает, и что окно действительно скользящее,
 * и что счётчики у разных пользователей и маршрутов не смешиваются.
 */

/** Guard'у от контроллера нужно только имя — оно попадает в ключ окна. */
const ORDERS_CONTROLLER = { name: 'OrdersController' };
const OFFERS_CONTROLLER = { name: 'OffersController' };

function createContext(options: {
  userId?: string;
  ip?: string;
  handler?: string;
  controller?: { name: string };
}) {
  const headers: Record<string, string> = {};
  const handler = { name: options.handler ?? 'create' };

  return {
    context: {
      getHandler: () => handler,
      getClass: () => options.controller ?? ORDERS_CONTROLLER,
      switchToHttp: () => ({
        getRequest: () => ({ user: options.userId ? { id: options.userId } : undefined, ip: options.ip }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        }),
      }),
    } as unknown as ExecutionContext,
    headers,
  };
}

/** Reflector, который отдаёт одни и те же настройки любому маршруту. */
function reflectorWith(throttle: ThrottleOptions | undefined): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
    key === THROTTLE_KEY ? throttle : undefined,
  );
  return reflector;
}

describe('ThrottleGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('пропускает запросы в пределах лимита и отклоняет следующий', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 3, ttl: 60_000 }));
    const { context, headers } = createContext({ userId: 'user-1' });

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(headers['Retry-After']).toBe('60');
  });

  it('отклонение отдаёт 429 с русским текстом', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 1, ttl: 60_000 }));
    const { context } = createContext({ userId: 'user-1' });

    guard.canActivate(context);

    try {
      guard.canActivate(context);
      expect.unreachable('второй запрос должен был получить отказ');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as { statusCode: number; message: string };
      expect(response.statusCode).toBe(429);
      expect(response.message).toContain('Слишком много запросов');
    }
  });

  it('окно скользящее: старые запросы выпадают и лимит освобождается', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 2, ttl: 60_000 }));
    const { context } = createContext({ userId: 'user-1' });

    guard.canActivate(context);
    guard.canActivate(context);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    vi.advanceTimersByTime(60_001);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('лимит считается на пользователя, а не на всех сразу', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 1, ttl: 60_000 }));

    expect(guard.canActivate(createContext({ userId: 'user-1' }).context)).toBe(true);
    expect(guard.canActivate(createContext({ userId: 'user-2' }).context)).toBe(true);
    expect(() => guard.canActivate(createContext({ userId: 'user-1' }).context)).toThrow(
      HttpException,
    );
  });

  it('разные маршруты считаются отдельно', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 1, ttl: 60_000 }));

    expect(guard.canActivate(createContext({ userId: 'u', handler: 'create' }).context)).toBe(true);
    expect(guard.canActivate(createContext({ userId: 'u', handler: 'remove' }).context)).toBe(true);
    expect(
      guard.canActivate(
        createContext({ userId: 'u', handler: 'create', controller: OFFERS_CONTROLLER }).context,
      ),
    ).toBe(true);
  });

  it('без вошедшего пользователя считает по IP', () => {
    const guard = new ThrottleGuard(reflectorWith({ limit: 1, ttl: 60_000 }));

    expect(guard.canActivate(createContext({ ip: '10.0.0.1' }).context)).toBe(true);
    expect(guard.canActivate(createContext({ ip: '10.0.0.2' }).context)).toBe(true);
    expect(() => guard.canActivate(createContext({ ip: '10.0.0.1' }).context)).toThrow(
      HttpException,
    );
  });

  it('без настроек на маршруте действует значение по умолчанию', () => {
    const guard = new ThrottleGuard(reflectorWith(undefined));
    const { context } = createContext({ userId: 'user-1' });

    for (let i = 0; i < 20; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }

    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });
});
