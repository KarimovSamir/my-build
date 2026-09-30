import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import { NodeEnv } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SUPABASE_ADMIN } from '../../supabase/supabase.module.js';
import { deleteStaleSignups } from './stale-signups.js';

/** Раз в час: срок — сутки, точнее не нужно. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Первая проверка — не сразу: старт и `/health` не должны её ждать. */
const FIRST_CHECK_DELAY_MS = 2 * 60 * 1000;

/**
 * Плановая уборка неподтверждённых регистраций (`stale-signups.ts`).
 *
 * Только при `NODE_ENV=production` — по той же причине, что и сброс демо:
 * локальный backend и e2e ходят в ту же базу, и уборка из них удаляла бы
 * учётки, которые e2e заводит неподтверждёнными намеренно.
 */
@Injectable()
export class StaleSignupsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StaleSignupsService.name);

  private firstCheck: NodeJS.Timeout | null = null;
  private schedule: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(SUPABASE_ADMIN) private readonly admin: SupabaseClient,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') !== NodeEnv.Production) {
      return;
    }

    // `unref`: таймеры не должны держать процесс живым при остановке.
    this.firstCheck = setTimeout(() => {
      void this.tick();
      this.schedule = setInterval(() => void this.tick(), CHECK_INTERVAL_MS).unref();
    }, FIRST_CHECK_DELAY_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.firstCheck) clearTimeout(this.firstCheck);
    if (this.schedule) clearInterval(this.schedule);
  }

  /** Один проход. Ошибку не выпускает: необработанный отказ уронил бы процесс. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const deleted = await deleteStaleSignups({ prisma: this.prisma, admin: this.admin });

      if (deleted > 0) {
        this.logger.log(`Удалено неподтверждённых регистраций: ${deleted}`);
      }
    } catch (error) {
      this.logger.error(
        'Уборка неподтверждённых регистраций не выполнена',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
