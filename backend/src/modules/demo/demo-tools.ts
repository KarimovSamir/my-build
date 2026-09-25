/**
 * Подключения для скриптов, работающих с демо вне Nest: `npm run db:seed`,
 * `npm run db:wipe` и уборка после e2e (`test/support/global-setup.ts`).
 *
 * Одна сборка на всех: иначе каждый скрипт по-своему выбирал бы строку
 * подключения, бакет и пароль, и уборка после тестов разошлась бы с seed.
 * Окружение читается из `process.env` — `.env` загружает сам вызывающий.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import type { SupabaseClient } from '@supabase/supabase-js';

import { DEMO_PASSWORD } from '@mybuild/shared';

import { PrismaClient } from '../../generated/prisma/client.js';
import { createSupabaseAdminClient } from '../../supabase/supabase-admin.js';

export interface DemoTools {
  prisma: PrismaClient;
  admin: SupabaseClient;
  bucket: string;
  /**
   * Пароль, с которым создаются недостающие демо-учётки.
   *
   * Умолчание — из `shared/`: тот же пароль показывает экран входа. Свой
   * `SEED_PASSWORD` до экрана не доедет и действует только на учётки, которые
   * создаются заново: у помеченных флагом `demo` пароль менять запрещает база.
   */
  password: string;
  /** Убрать объекты из бакета. Сбой только предупреждает — это уборка. */
  removeObjects: (keys: string[]) => Promise<void>;
  close: () => Promise<void>;
}

/** Столько ключей хранилище принимает в одном запросе на удаление. */
const REMOVE_BATCH = 1000;

export function openDemoTools(): DemoTools {
  // DIRECT_URL, а не пул: сброс идёт одной длинной транзакцией.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Не задана строка подключения: заполни DIRECT_URL в backend/.env ' +
        '(шаблон — backend/env.example)',
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const admin = createSupabaseAdminClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'order-files';

  return {
    prisma,
    admin,
    bucket,
    password: process.env.SEED_PASSWORD ?? DEMO_PASSWORD,
    removeObjects: async (keys) => {
      for (let start = 0; start < keys.length; start += REMOVE_BATCH) {
        const batch = keys.slice(start, start + REMOVE_BATCH);
        // oxlint-disable-next-line no-await-in-loop
        const { error } = await admin.storage.from(bucket).remove(batch);

        if (error) {
          // Лишний объект в бакете — не повод считать уборку проваленной:
          // данные в базе уже на месте, а ссылок на него нет.
          console.warn(`Не удалось удалить из бакета ${batch.length} объект(ов): ${error.message}`);
        }
      }
    },
    close: () => prisma.$disconnect(),
  };
}
