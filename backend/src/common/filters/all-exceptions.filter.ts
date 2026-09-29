import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { ApiError } from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';

/**
 * Через сколько секунд повторять запрос, отбитый перегрузкой (503). Очередь
 * заказа и пул соединений освобождаются за секунды, а не за минуты.
 */
const RETRY_AFTER_SECONDS = 2;

const DATABASE_BUSY = 'Сервер сейчас перегружен, повторите через пару секунд';

/**
 * Единый формат ошибок для всего API (ТЗ §5).
 *
 * Наружу всегда уходит `{ statusCode, message, error }`. Неожиданные исключения
 * превращаются в 500 без подробностей: детали пишутся в лог, клиенту не видны —
 * иначе текст ошибки Prisma или стек попадут в браузер.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toApiError(exception);

    // 503 — это «повторите», и клиенту надо сказать когда (ТЗ §5: формат тела
    // тот же, срок — стандартным заголовком).
    if (body.statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
      response.setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
    }

    if (body.statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
      // Перегрузка ожидаема и идёт пачкой: стек на каждый отказ забил бы лог,
      // а причину (очередь заказа или пул) видно по тексту.
      this.logger.warn(
        `${request.method} ${request.url} → ${body.statusCode}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
      );
    } else if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // ValidationPipe отдаёт объект со списком сообщений — сохраняем его,
      // чтобы форма на фронте могла подсветить конкретные поля.
      if (typeof payload === 'object' && payload !== null) {
        const shaped = payload as Partial<ApiError>;
        return {
          statusCode: status,
          message: shaped.message ?? exception.message,
          error: shaped.error ?? statusName(status),
        };
      }

      return {
        statusCode: status,
        message: typeof payload === 'string' ? payload : exception.message,
        error: statusName(status),
      };
    }

    // P2028 — транзакция не получила соединение из пула вовремя (или не успела
    // закончиться). Это перегрузка, а не поломка: запрос можно повторить,
    // и ответить надо так, чтобы клиент это понял, а не «внутренней ошибкой».
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2028'
    ) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: DATABASE_BUSY,
        error: statusName(HttpStatus.SERVICE_UNAVAILABLE),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера',
      error: statusName(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }
}

/**
 * Имя статуса для поля `error` — в том же виде, в каком его подставляет сам
 * Nest: `Not Found`, `Bad Request`, `Internal Server Error`.
 *
 * Раньше это место писало то `Not Found` (готовое тело исключения), то
 * `NOT_FOUND` (`HttpStatus[status]`), и единый формат ошибки из ТЗ §5
 * соблюдался по составу полей, но не по их виду. Собственные коды исключений
 * (`InvalidStateTransition` и подобные) сюда не попадают — они приходят
 * в теле исключения и отдаются как есть.
 */
function statusName(status: number): string {
  const name: string | undefined = HttpStatus[status];

  if (!name) return 'Error';

  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
