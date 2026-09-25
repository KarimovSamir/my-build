/**
 * Тестовые данные для разработки и демо: один клиент, три компании и по заказу
 * в каждом статусе state-машины (ТЗ §10, Фаза 1).
 *
 * Запуск: `npm run db:seed`. Вместе с полной очисткой базы — `npm run db:reset`
 * (`scripts/wipe-database.ts`): так база возвращается к стандартному виду после
 * e2e и ручных проверок.
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

import { DEMO_EMAILS } from '@mybuild/shared';

import { resetDemo } from '../src/modules/demo/demo-reset.js';
import { openDemoTools } from '../src/modules/demo/demo-tools.js';

const tools = openDemoTools();
const { prisma } = tools;

async function main(): Promise<void> {
  const result = await resetDemo(tools);

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
  console.log(`Вход в тестовые аккаунты: пароль ${tools.password}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed не выполнен:', error);
    process.exitCode = 1;
  })
  .finally(() => tools.close());
