import { Controller, Get, HttpCode, HttpStatus, Logger, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../common/decorators/public.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ThrottleGuard } from '../../common/guards/throttle.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: 'up' | 'down';
}

/**
 * Проверка состояния сервиса.
 *
 * Отдаёт 200, когда всё живо, и 503, когда база недоступна — так падение
 * заметно и мониторингу, и разработчику, а не только в логах.
 *
 * Единственный публичный маршрут API: мониторинг ходит сюда без токена.
 * Поэтому наружу уходит только «up» или «down»: текст ошибки Prisma/pg
 * содержит хост, порт и имя базы, и показывать его кому угодно нельзя —
 * причина пишется в лог, где её видит только владелец сервиса.
 *
 * Ограничение частоты щедрое: маршрут делает настоящий запрос к базе,
 * но по нему же ходит внешний пингер, будящий бесплатный тариф Supabase.
 */
@Public()
@Controller('health')
@UseGuards(ThrottleGuard)
@Throttle({ limit: 60, ttl: 60_000 })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const database = await this.prisma.checkConnection();

    if (!database.ok) {
      this.logger.error(`База недоступна: ${database.error ?? 'причина неизвестна'}`);
      response.status(HttpStatus.SERVICE_UNAVAILABLE);

      return {
        status: 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        database: 'down',
      };
    }

    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      database: 'up',
    };
  }
}
