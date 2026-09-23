/**
 * Тестовые данные для разработки и демо: один клиент, три компании и по заказу
 * в каждом статусе state-машины (ТЗ §10, Фаза 1).
 *
 * Запуск: `npm run db:seed`.
 *
 * Это тот же сброс демо, что сервер выполняет по расписанию
 * (`src/modules/demo/demo-reset.ts`), только без проверки «не пора ли»:
 * данные и порядок действий у них общие. Учётки не пересоздаются, если уже
 * помечены флагом `demo`, — вошедшие посетители сессию не теряют.
 *
 * Скрипт идемпотентен: удаляет заказы, предложения и уведомления демо-учёток,
 * возвращает их профили и заводит данные заново. Чужие данные не трогает,
 * кроме предложений демо-компаний по чужим заказам.
 *
 * Файлы существуют только строками в БД; в бакете Supabase Storage их нет,
 * поэтому скачивание по signed URL на seed-данных не сработает. Зато объекты,
 * которые посетители загрузили в демо-заказы, удаляются вместе с заказами.
 */

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { DEMO_EMAILS, DEMO_PASSWORD } from '@mybuild/shared';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { resetDemo } from '../src/modules/demo/demo-reset.js';
import { createSupabaseAdminClient } from '../src/supabase/supabase-admin.js';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Не задана строка подключения: заполни DIRECT_URL в backend/.env ' +
      '(шаблон — backend/env.example)',
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Пароль тестовых учётных записей. Годится только для локальной разработки
 * и для демо; на реальных данных seed не запускают.
 *
 * Умолчание берётся из `shared/`: тот же пароль показывает экран входа.
 * Заданный здесь свой `SEED_PASSWORD` до экрана не доедет — демо-доступ и
 * собственный пароль вместе не живут. Действует он только на учётки, которые
 * создаются заново: у помеченных флагом `demo` пароль менять запрещает база.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? DEMO_PASSWORD;

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'order-files';

async function main(): Promise<void> {
  const admin = createSupabaseAdminClient();

  const result = await resetDemo({
    prisma,
    admin,
    password: SEED_PASSWORD,
    removeObjects: async (keys) => {
      if (keys.length === 0) return;

      const { error } = await admin.storage.from(BUCKET).remove(keys);
      if (error) {
        // Как и на сервере: лишний объект в бакете — не повод считать seed
        // проваленным, данные в базе уже на месте.
        console.warn(`Не удалось удалить из бакета ${keys.length} объект(ов): ${error.message}`);
      }
    },
  });

  if (result && result.recreatedUsers > 0) {
    console.log(`Учётные записи созданы заново: ${result.recreatedUsers}`);
  }

  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(DEMO_EMAILS) } },
    select: { id: true, email: true },
  });
  const ids = users.map((user) => user.id);
  const clientId = users.find((user) => user.email === DEMO_EMAILS.client)?.id;

  // Без этой проверки `where: { clientId: undefined }` посчитал бы заказы всех.
  if (!clientId) throw new Error('Демо-клиент не найден после сброса');

  const [ordersCount, offers, files, notifications] = await Promise.all([
    prisma.order.count({ where: { clientId } }),
    prisma.offer.count({ where: { companyId: { in: ids } } }),
    prisma.orderFile.count({ where: { order: { clientId } } }),
    prisma.notification.count({ where: { userId: { in: ids } } }),
  ]);

  console.log(
    `Готово: пользователей ${users.length}, заказов ${ordersCount}, ` +
      `предложений ${offers}, файлов ${files}, уведомлений ${notifications}`,
  );
  console.log(`Вход в тестовые аккаунты: пароль ${SEED_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed не выполнен:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
