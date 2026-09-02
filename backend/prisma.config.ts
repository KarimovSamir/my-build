import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Конфигурация Prisma CLI (миграции, генерация, seed).
 *
 * Здесь намеренно стоит DIRECT_URL, а не DATABASE_URL: миграции меняют
 * структуру базы, а пул соединений Supabase (порт 6543) для этого не годится.
 * Приложение в рантайме, наоборот, ходит через пул — строку подключения ему
 * отдаёт драйвер-адаптер в src/prisma/prisma.service.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
