import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';

import { DEMO_PASSWORD } from '@mybuild/shared';

import { NodeEnv } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SUPABASE_ADMIN } from '../../supabase/supabase.module.js';
import { FilesService } from '../files/files.service.js';
import { isDemoStale, lastDemoReset, resetDemo } from './demo-reset.js';

/**
 * Как часто демо возвращается к исходному виду.
 *
 * Компромисс двух бед: реже — дольше живёт то, что один посетитель натворил
 * для всех (и дольше закрыта исчерпанная им квота файлов); чаще — выше шанс,
 * что сброс придётся на чей-то визит и созданный заказ исчезнет у него
 * на глазах. Сессию сброс не рвёт — учётки остаются прежними.
 */
export const DEMO_RESET_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Как часто проверять, не пора ли. Проверка — один `SELECT` по индексу,
 * а метка сброса живёт в базе, поэтому ни перезапуск, ни сон инстанса
 * не сдвигают расписание дальше, чем на один такой шаг.
 */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Первая проверка — не сразу: старт и `/health` не должны ждать сброса. */
const FIRST_CHECK_DELAY_MS = 60 * 1000;

/**
 * Плановый сброс демо на сервере (см. `demo-reset.ts`).
 *
 * Работает только при `NODE_ENV=production`. Локальный backend и e2e ходят
 * в ту же базу Supabase, что и прод, и сброс из них срывал бы прогон
 * тестов посреди работы. Разработчику остаётся `npm run db:seed`.
 */
@Injectable()
export class DemoResetService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DemoResetService.name);

  private firstCheck: NodeJS.Timeout | null = null;
  private schedule: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    @Inject(SUPABASE_ADMIN) private readonly admin: SupabaseClient,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') !== NodeEnv.Production) {
      return;
    }

    // `unref`: таймеры не должны держать процесс живым при остановке.
    this.firstCheck = setTimeout(() => {
      void this.tick();
      this.schedule = setInterval(
        () => void this.tick(),
        CHECK_INTERVAL_MS,
      ).unref();
    }, FIRST_CHECK_DELAY_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.firstCheck) clearTimeout(this.firstCheck);
    if (this.schedule) clearInterval(this.schedule);
  }

  /**
   * Одна проверка. Ошибку не выпускает: упавший сброс повторится на следующем
   * шаге, а необработанное отклонение промиса уронило бы процесс целиком.
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // Дешёвая проверка без Admin API: в подавляющем большинстве шагов
      // сбрасывать нечего, и ходить в Supabase Auth незачем.
      const last = await lastDemoReset(this.prisma);
      if (!isDemoStale(last, DEMO_RESET_INTERVAL_MS, Date.now())) return;

      const result = await resetDemo(
        {
          prisma: this.prisma,
          admin: this.admin,
          removeObjects: (keys) => this.files.removeStorageObjects(keys),
          password: DEMO_PASSWORD,
        },
        { maxAgeMs: DEMO_RESET_INTERVAL_MS },
      );

      if (result) {
        this.logger.log(
          `Демо сброшено: учёток создано заново ${result.recreatedUsers}, ` +
            `объектов на удаление ${result.removedObjects}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Сброс демо не выполнен',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
