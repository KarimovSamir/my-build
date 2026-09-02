import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Клиент Prisma как провайдер Nest.
 *
 * Подключение идёт через драйвер-адаптер (Prisma 7) по строке DATABASE_URL —
 * это пул соединений Supabase. Прямое подключение DIRECT_URL используется
 * только CLI для миграций и здесь не нужно.
 *
 * Недоступная база не роняет приложение: сервер поднимется, а `/health`
 * честно покажет `database: "down"` с причиной. Так видно, что именно сломано,
 * вместо падения процесса без объяснений.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  private connected = false;
  private lastError: string | null = null;

  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Проверить связь с базой при старте. Ошибку запоминает, наружу не бросает.
   *
   * Проверка идёт запросом, а не через `$connect()`: с драйвер-адаптером
   * Prisma 7 подключается лениво, и `$connect()` завершается успешно даже
   * тогда, когда сервер базы недоступен.
   */
  async connect(): Promise<boolean> {
    const { ok, error } = await this.checkConnection();

    if (ok) {
      this.logger.log('Подключение к базе установлено');
    } else {
      this.logger.error(`Не удалось подключиться к базе: ${error}`);
    }

    return ok;
  }

  /**
   * Живая проверка соединения — реальный запрос, а не закэшированный флаг.
   * Использует `/health`.
   */
  async checkConnection(): Promise<{ ok: boolean; error: string | null }> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      this.lastError = null;
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
    }

    return { ok: this.connected, error: this.lastError };
  }
}
