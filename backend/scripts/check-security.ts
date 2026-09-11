import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { createSupabaseAdminClient } from '../src/supabase/supabase-admin.js';

/**
 * Проверка двух требований ТЗ §6, которые живут не в коде, а в самой Supabase:
 * RLS на всех таблицах `public` **без единой политики** и приватный бакет.
 *
 * Зачем скрипт, если это задано миграцией и `storage:setup`. Оба требования
 * относятся к состоянию конкретного проекта Supabase, а не репозитория:
 * новая таблица, добавленная миграцией без `ENABLE ROW LEVEL SECURITY`,
 * и бакет, созданный руками через панель, ломают их молча — приложение
 * при этом работает как ни в чём не бывало. Отсюда отдельная команда,
 * которую прогоняют после `db:deploy` на каждой новой базе.
 *
 * Запуск: `npm run security:check -w backend`.
 */

interface TableRow {
  table: string;
  rlsEnabled: boolean;
  policies: bigint;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Не задан DATABASE_URL (шаблон — backend/env.example)');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Накопитель провалов: скрипт показывает все сразу, а не падает на первом. */
const problems: string[] = [];

async function checkRowLevelSecurity(): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT c.relname AS "table",
           c.relrowsecurity AS "rlsEnabled",
           (
             SELECT count(*)
             FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname
           ) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  if (tables.length === 0) {
    problems.push('В схеме public нет ни одной таблицы — миграции не применялись?');
    return;
  }

  for (const { table, rlsEnabled, policies } of tables) {
    const policyCount = Number(policies);

    if (!rlsEnabled) {
      problems.push(`Таблица ${table}: RLS выключен`);
    }

    // Политик быть не должно вовсе: браузер к таблицам не ходит, а любая
    // политика открыла бы прямой доступ по публичному ключу.
    if (policyCount > 0) {
      problems.push(`Таблица ${table}: политик RLS ${policyCount}, ожидалось 0`);
    }

    console.log(
      `  ${rlsEnabled && policyCount === 0 ? '✓' : '✗'} ${table}` +
        ` — RLS ${rlsEnabled ? 'включён' : 'выключен'}, политик ${policyCount}`,
    );
  }
}

async function checkStorageBucket(): Promise<void> {
  const name = process.env.SUPABASE_STORAGE_BUCKET ?? 'order-files';
  const { data: buckets, error } = await createSupabaseAdminClient().storage.listBuckets();

  if (error) {
    problems.push(`Не удалось получить список бакетов: ${error.message}`);
    return;
  }

  const bucket = buckets.find((item) => item.name === name);

  if (!bucket) {
    problems.push(`Бакета ${name} нет — нужен «npm run storage:setup -w backend»`);
    return;
  }

  if (bucket.public) {
    problems.push(`Бакет ${name} публичный: файлы заказов доступны по прямой ссылке`);
  }

  console.log(`  ${bucket.public ? '✗' : '✓'} ${name} — ${bucket.public ? 'публичный' : 'приватный'}`);
}

async function main(): Promise<void> {
  console.log('Таблицы схемы public (ТЗ §6: RLS включён, политик ноль):');
  await checkRowLevelSecurity();

  console.log('\nБакет файлов заказов (ТЗ §6: приватный):');
  await checkStorageBucket();

  if (problems.length > 0) {
    console.error(`\nПроверка не пройдена:\n${problems.map((line) => `  • ${line}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nОба требования ТЗ §6 выполнены.');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
