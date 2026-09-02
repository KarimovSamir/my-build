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

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
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
          error: shaped.error ?? HttpStatus[status] ?? 'Error',
        };
      }

      return {
        statusCode: status,
        message: typeof payload === 'string' ? payload : exception.message,
        error: HttpStatus[status] ?? 'Error',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера',
      error: 'Internal Server Error',
    };
  }
}
