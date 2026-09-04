import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ArgumentsHost, Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@mybuild/shared';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

/**
 * Единый формат ошибки (ТЗ §5): наружу всегда `{ statusCode, message, error }`,
 * причём `error` — в одном и том же виде независимо от того, каким было тело
 * исключения (находка R3-Н4). Подробности неожиданных ошибок наружу не уходят.
 */

const filter = new AllExceptionsFilter();
const json = vi.fn();
const status = vi.fn(() => ({ json }));

// Стек 500-х уходит в Logger — в выводе теста он только мешает.
vi.spyOn((filter as unknown as { logger: Logger }).logger, 'error').mockImplementation(
  () => undefined,
);

beforeEach(() => {
  json.mockClear();
  status.mockClear();
});

const host = {
  switchToHttp: () => ({
    getResponse: () => ({ status }),
    getRequest: () => ({ method: 'GET', url: '/orders' }),
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
});
