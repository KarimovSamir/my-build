import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: 'up' | 'down';
  databaseError?: string;
}

/**
 * Проверка состояния сервиса.
 *
 * Отдаёт 200, когда всё живо, и 503, когда база недоступна — так падение
 * заметно и мониторингу, и разработчику, а не только в логах.
 *
 * Единственный публичный маршрут API: мониторинг ходит сюда без токена.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const database = await this.prisma.checkConnection();

    if (!database.ok) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        database: 'down',
        databaseError: database.error ?? 'неизвестная ошибка',
      };
    }

    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      database: 'up',
    };
  }
}
