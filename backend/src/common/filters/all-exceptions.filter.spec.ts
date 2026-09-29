import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost, Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

/**
 * Единый формат ошибки (ТЗ §5): наружу всегда `{ statusCode, message, error }`,
 * причём `error` — в одном и том же виде независимо от того, каким было тело
 * исключения (находка R3-Н4). Подробности неожиданных ошибок наружу не уходят.
 */

const filter = new AllExceptionsFilter();
const json = vi.fn();
const status = vi.fn(() => ({ json }));
const setHeader = vi.fn((_name: string, _value: string) => undefined);

// Стек 500-х уходит в Logger — в выводе теста он только мешает.
const logger = (filter as unknown as { logger: Logger }).logger;
vi.spyOn(logger, 'error').mockImplementation(() => undefined);
vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  json.mockClear();
  status.mockClear();
  setHeader.mockClear();
  vi.mocked(logger.error).mockClear();
});

const host = {
  switchToHttp: () => ({
    getResponse: () => ({ status, setHeader }),
    getRequest: () => ({ method: 'GET', originalUrl: '/orders?q=Баку, ул. Низами 5' }),
  }),
} as unknown as ArgumentsHost;

function caught(exception: unknown): ApiError {
  filter.catch(exception, host);

  expect(json).toHaveBeenCalledTimes(1);
  return json.mock.calls[0]![0] as ApiError;
}

describe('AllExceptionsFilter', () => {
  it('исключение Nest со строкой сообщения', () => {
    const body = caught(new NotFoundException('Заказ не найден'));

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(body).toEqual({
      statusCode: 404,
      message: 'Заказ не найден',
      error: 'Not Found',
    });
  });

  it('список сообщений ValidationPipe сохраняется целиком', () => {
    // По нему форма подсвечивает конкретные поля — свернуть его в строку нельзя.
    const body = caught(
      new BadRequestException({
        statusCode: 400,
        message: ['title не может быть пустым', 'budget — число'],
        error: 'Bad Request',
      }),
    );

    expect(body.message).toEqual(['title не может быть пустым', 'budget — число']);
    expect(body.error).toBe('Bad Request');
  });

  it('собственный код исключения отдаётся как есть', () => {
    // Так подписывает свои отказы state-машина: `error` для неё — код,
    // по которому фронт различает причину, а не название статуса.
    const body = caught(
      new ConflictException({
        statusCode: 409,
        message: 'Недопустимый переход',
        error: 'InvalidStateTransition',
      }),
    );

    expect(body.error).toBe('InvalidStateTransition');
  });

  it('имя статуса одинаковое, каким бы ни было тело исключения', () => {
    // Раньше строковое тело давало `NOT_FOUND`, а объектное — `Not Found`.
    const fromString = caught(new HttpException('Нет такого файла', HttpStatus.NOT_FOUND));
    json.mockClear();
    const fromObject = caught(new NotFoundException('Нет такого файла'));

    expect(fromString.error).toBe('Not Found');
    expect(fromString).toEqual(fromObject);
  });

  it('неожиданное исключение превращается в 500 без подробностей', () => {
    const body = caught(new Error('connect ECONNREFUSED 10.0.0.1:5432 db=mybuild'));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      statusCode: 500,
      message: 'Внутренняя ошибка сервера',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('не спотыкается о брошенную строку', () => {
    expect(caught('что-то пошло не так').statusCode).toBe(500);
  });

  it('нехватка соединений с базой — 503 с Retry-After, а не 500', () => {
    // Так Prisma сообщает, что транзакция не дождалась соединения из пула:
    // это перегрузка, и клиенту надо сказать, что запрос можно повторить.
    const body = caught(
      new Prisma.PrismaClientKnownRequestError(
        'Transaction API error: Unable to start a transaction in the given time.',
        { code: 'P2028', clientVersion: 'test' },
      ),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body.error).toBe('Service Unavailable');
    expect(JSON.stringify(body)).not.toContain('Transaction API');
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '2');
  });

  it('другая ошибка Prisma остаётся 500', () => {
    const body = caught(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    expect(body.statusCode).toBe(500);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('503 от очереди заказа отдаёт свой текст и Retry-After', () => {
    const body = caught(new ServiceUnavailableException('Заказ сейчас меняется'));

    expect(body.message).toBe('Заказ сейчас меняется');
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '2');
  });

  it('слишком большое тело запроса — 413, а не 500', () => {
    // Так его бросает body-parser: не `HttpException`, а `http-errors`.
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });

    const body = caught(tooLarge);

    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body).toEqual({
      statusCode: 413,
      message: 'Тело запроса слишком большое',
      error: 'Payload Too Large',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('битый JSON — 400 с понятным текстом', () => {
    const body = caught(
      Object.assign(new SyntaxError('Unexpected token'), {
        status: 400,
        expose: true,
        type: 'entity.parse.failed',
      }),
    );

    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Тело запроса — некорректный JSON');
  });

  it('ошибка со статусом, но без expose, остаётся 500', () => {
    // `expose: false` — ошибка сервера, её текст клиенту не показывают.
    const body = caught(Object.assign(new Error('secret'), { status: 400, expose: false }));

    expect(body.statusCode).toBe(500);
  });

  it('в лог 500-х не попадает строка запроса', () => {
    caught(new Error('boom'));

    const [line] = vi.mocked(logger.error).mock.calls.at(-1)!;
    expect(line).toBe('GET /orders → 500');
  });
});
