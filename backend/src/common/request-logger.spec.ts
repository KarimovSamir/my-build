import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestWithUser } from '../modules/auth/auth-user.js';

import { requestLoggerMiddleware } from './request-logger.js';

/**
 * Строка пишется по событию `finish`, то есть уже после того, как guard'ы
 * решили судьбу запроса. Поэтому тест и подсовывает ответ эмиттером: иначе
 * проверялось бы не поведение, а факт вызова `next`.
 */

interface FakeRequest {
  method: string;
  originalUrl: string;
  user?: { id: string };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Прогон запроса до ответа с указанным статусом. Возвращает шпионы логгера. */
function run(request: FakeRequest, statusCode: number) {
  const spies = {
    log: vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {}),
  };

  const response = Object.assign(new EventEmitter(), { statusCode });
  const next = vi.fn();

  requestLoggerMiddleware(
    request as unknown as RequestWithUser,
    response as unknown as Response,
    next,
  );

  expect(next).toHaveBeenCalledOnce();
  // До ответа в логе пусто: иначе строка не знала бы ни статуса, ни времени.
  expect(spies.log).not.toHaveBeenCalled();

  response.emit('finish');

  return spies;
}

describe('requestLoggerMiddleware', () => {
  it('пишет метод, путь, статус и пользователя', () => {
    const { log } = run(
      { method: 'GET', originalUrl: '/orders', user: { id: 'user-1' } },
      200,
    );

    const line = String(log.mock.calls[0]?.[0]);

    expect(line).toContain('GET /orders');
    expect(line).toContain('200');
    expect(line).toContain('user-1');
    expect(line).toMatch(/\d+ мс/);
  });

  it('не пишет строку запроса: там лежит то, что пользователь искал', () => {
    const { log } = run(
      { method: 'GET', originalUrl: '/orders?q=Ленина%2012&page=2', user: { id: 'user-1' } },
      200,
    );

    const line = String(log.mock.calls[0]?.[0]);

    expect(line).toContain('GET /orders ');
    expect(line).not.toContain('q=');
    expect(line).not.toContain('page=');
  });

  it('называет гостем запрос без пользователя', () => {
    const { log } = run({ method: 'GET', originalUrl: '/' }, 200);

    expect(String(log.mock.calls[0]?.[0])).toContain('гость');
  });

  it('отказ клиенту — предупреждение, а не обычная строка', () => {
    const { warn, log } = run({ method: 'POST', originalUrl: '/offers' }, 403);

    expect(warn).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  it('падение сервера — ошибка', () => {
    const { error, warn } = run({ method: 'POST', originalUrl: '/orders' }, 500);

    expect(error).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('пингер уходит в debug и не забивает лог', () => {
    const { debug, log } = run({ method: 'GET', originalUrl: '/health' }, 200);

    expect(debug).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  it('упавший health остаётся ошибкой, а не debug', () => {
    const { error, debug } = run({ method: 'GET', originalUrl: '/health' }, 503);

    expect(error).toHaveBeenCalledOnce();
    expect(debug).not.toHaveBeenCalled();
  });
});
