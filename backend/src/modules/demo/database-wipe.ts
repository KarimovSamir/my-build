/**
 * Полная очистка базы — всё, кроме четырёх демо-учёток.
 *
 * Пара к `resetDemo`: e2e и ручные проверки работают на боевой базе и
 * оставляют в ней своих пользователей, заказы и файлы. После них база
 * очищается целиком, а `resetDemo` заливает стандартные демо-данные из
 * `demo-data.ts` — те же, что восстанавливает плановый сброс на сервере.
 * Отдельного снимка данных нет намеренно: второй источник тех же данных
 * разошёлся бы с кодом (решение пользователя).
 *
 * Демо-учётки не удаляются: тогда у посетителей, вошедших в демо, пропала бы
 * сессия. Удаляется всё остальное, включая учётки, которые завели сами
 * посетители, — в базе после проверки не должно остаться ничего чужого
 * (решение пользователя).
 *
 * Модуль без Nest: его зовут CLI (`npm run db:wipe`) и уборка после e2e.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DEMO_EMAILS } from '@mybuild/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  deleteAuthUsers,
  findAuthUsersWhere,
  isDemoAuthUser,
} from '../../supabase/supabase-admin.js';
import { resetDemo, type DemoResetDeps } from './demo-reset.js';

export interface DatabaseWipeDeps {
  prisma: PrismaClient;
  admin: SupabaseClient;
  /** Бакет файлов заказов: очищается целиком. */
  bucket: string;
  /** Убрать объекты из бакета. */
  removeObjects: (keys: string[]) => Promise<void>;
}

export interface DatabaseWipeResult {
  /** Сколько учёток удалено (все, кроме демо). */
  deletedUsers: number;
  /** Сколько объектов отправлено на удаление из бакета. */
  removedObjects: number;
}

const WIPE_TX_OPTIONS = { timeout: 60_000, maxWait: 15_000 } as const;

export async function wipeDatabase(deps: DatabaseWipeDeps): Promise<DatabaseWipeResult> {
  // Учётки — через Admin API: прямое удаление из auth.users обошло бы GoTrue.
  // Профили и всё, что к ним привязано (заказы, предложения, уведомления),
  // уходят каскадом по внешнему ключу.
  const strangers = (await findAuthUsersWhere(deps.admin, () => true)).filter(
    (user) => !isDemoAuthUser(user),
  );
  await deleteAuthUsers(
    deps.admin,
    strangers.map((user) => user.id),
  );

  await deps.prisma.$transaction(async (tx) => {
    // Та же блокировка, что у `resetDemo`: плановый сброс на сервере
    // не вклинится посреди очистки.
    await tx.$queryRaw`
      SELECT id FROM "User" WHERE email = ${DEMO_EMAILS.client} FOR UPDATE
    `;

    // Остались только данные демо-учёток. Каскадом от заказов уходят
    // предложения, файлы, сдачи и платежи.
    await tx.order.deleteMany({});
    await tx.offer.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.userCard.deleteMany({});
  }, WIPE_TX_OPTIONS);

  // Бакет — целиком и после коммита: строк `OrderFile` больше нет, значит,
  // любой объект в нём ничей. Список берётся из базы: API хранилища
  // перечисляет объекты только по одной папке.
  const objects = await deps.prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM storage.objects WHERE bucket_id = ${deps.bucket}
  `;
  const keys = objects.map((object) => object.name);
  await deps.removeObjects(keys);

  return { deletedUsers: strangers.length, removedObjects: keys.length };
}

export interface DatabaseResetResult extends DatabaseWipeResult {
  /** Сколько демо-учёток пришлось создать заново. */
  recreatedUsers: number;
}

/**
 * Очистить базу и залить стандартные демо-данные — то, что зовут после e2e
 * и ручных проверок (`npm run db:reset`).
 *
 * Сброс демо идёт без проверки «не пора ли» — как `npm run db:seed`.
 */
export async function resetDatabase(
  deps: DatabaseWipeDeps & DemoResetDeps,
): Promise<DatabaseResetResult> {
  const wiped = await wipeDatabase(deps);
  const restored = await resetDemo(deps);

  return {
    ...wiped,
    // `null` только при ожидании планового сброса, а без `maxAgeMs` его нет.
    recreatedUsers: restored?.recreatedUsers ?? 0,
  };
}
