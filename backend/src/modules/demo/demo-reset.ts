/**
 * Сброс демо к исходному виду: те же учётки, заказы, файлы и уведомления,
 * что заводит `npm run db:seed`.
 *
 * Зачем он нужен на сервере. Демо-аккаунты с экрана входа общие: всё, что
 * в них сделал один посетитель, видят остальные. Запреты закрывают только
 * то, что нельзя откатить (пароль, email, профиль), а заказы, предложения
 * и файлы — сама суть демо и остаются открытыми. Поэтому демо регулярно
 * возвращается к исходному виду само, без участия владельца.
 *
 * Учётки при этом **не пересоздаются**: идентификаторы остаются прежними,
 * и вошедший посетитель не теряет сессию — у него просто обновляются данные.
 * Пересоздаётся только учётка без флага `demo` (заведена до появления флага
 * или руками): пароль у такой мог смениться, а флаг без нового пароля ставить
 * бессмысленно. Учётке с флагом пароль менять запрещает база — он прежний.
 *
 * Модуль без Nest: его вызывают и CLI (`prisma/seed.ts`), и `DemoResetService`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ACTIVE_OFFER_STATUSES,
  DEMO_EMAILS,
  NotificationType,
  notificationTypeLabels,
} from '@mybuild/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  createAuthUser,
  deleteAuthUsers,
  findAuthUsersWhere,
  isDemoAuthUser,
} from '../../supabase/supabase-admin.js';
import { orderRef } from '../orders/order-notification.js';
import {
  DEMO_USERS,
  createDemoNotifications,
  createDemoOrders,
  demoProfile,
  type DemoUserIds,
  type DemoUserKey,
} from './demo-data.js';

export interface DemoResetDeps {
  prisma: PrismaClient;
  admin: SupabaseClient;
  /** Убрать объекты из бакета. Ошибку бросать не должна — это уборка. */
  removeObjects: (keys: string[]) => Promise<void>;
  /** Пароль, с которым создаются недостающие учётки. */
  password: string;
}

export interface DemoResetOptions {
  /**
   * Сбрасывать, только если с прошлого сброса прошло не меньше этого.
   * Без него сброс выполняется всегда — так его зовёт `npm run db:seed`.
   */
  maxAgeMs?: number;
  now?: () => number;
}

export interface DemoResetResult {
  /** Сколько учёток пришлось создать заново. */
  recreatedUsers: number;
  /** Сколько объектов отправлено на удаление из бакета. */
  removedObjects: number;
  /** Скольким настоящим компаниям сообщено, что их предложение ушло со сбросом. */
  notifiedCompanies: number;
}

/**
 * Запас транзакции: в ней два десятка запросов через пул Supabase, и это
 * единственное место, где они идут пачкой. Держать дольше незачем — всё,
 * что медленно (Admin API, бакет), вынесено наружу.
 */
const RESET_TX_OPTIONS = { timeout: 60_000, maxWait: 15_000 } as const;

/**
 * Когда демо сбрасывали в последний раз.
 *
 * Отдельной таблицы под это нет: метка — `updatedAt` профиля демо-клиента.
 * Профиль демо-учётки меняет только сброс (`PATCH /profile` им закрыт,
 * email — триггером), поэтому время его последней записи и есть время сброса.
 * `null` — демо-клиента нет вовсе.
 */
export async function lastDemoReset(
  prisma: PrismaClient,
): Promise<Date | null> {
  const client = await prisma.user.findUnique({
    where: { email: DEMO_EMAILS.client },
    select: { updatedAt: true },
  });

  return client?.updatedAt ?? null;
}

/** Пора ли сбрасывать: демо нет вовсе или оно старше `maxAgeMs`. */
export function isDemoStale(
  lastReset: Date | null,
  maxAgeMs: number,
  now: number,
): boolean {
  return lastReset === null || now - lastReset.getTime() >= maxAgeMs;
}

/**
 * Вернуть демо к исходному виду. `null` — сброс не понадобился: пока ждали
 * блокировку, его успел сделать кто-то другой.
 */
export async function resetDemo(
  deps: DemoResetDeps,
  options: DemoResetOptions = {},
): Promise<DemoResetResult | null> {
  const now = options.now ?? Date.now;
  const { ids, recreated, orphanKeys } = await ensureDemoUsers(deps);

  const reset = await deps.prisma.$transaction(async (tx) => {
    const clientId = ids.get('client')!;

    // Блокировка строки демо-клиента делает сброс одиночным: второй
    // экземпляр (или `db:seed` поверх планового) ждёт здесь и, дождавшись,
    // видит свежую метку. Без неё два сброса подряд наложили бы два набора
    // заказов.
    const [marker] = await tx.$queryRaw<{ updatedAt: Date }[]>`
      SELECT "updatedAt" FROM "User" WHERE id = ${clientId}::uuid FOR UPDATE
    `;

    if (
      options.maxAgeMs !== undefined &&
      recreated === 0 &&
      !isDemoStale(marker?.updatedAt ?? null, options.maxAgeMs, now())
    ) {
      return null;
    }

    const demoIds = [...ids.values()];

    // Ключи — до удаления: после каскада узнать, что убирать из бакета,
    // уже неоткуда.
    const files = await tx.orderFile.findMany({
      where: { order: { clientId: { in: demoIds } } },
      select: { storageKey: true },
    });

    // Настоящие компании, чьи предложения по демо-заказам ещё в игре, — в том
    // числе принятые и в работе. Каскад снесёт их молча, поэтому каждой —
    // то же уведомление, что при удалении заказа клиентом (`ORDER_DELETED`,
    // без ссылки: заказа больше нет). Отозванные и отклонённые не трогаем —
    // для их компаний заказ уже чужой, как и при обычном удалении.
    const outsiders = await tx.offer.findMany({
      where: {
        order: { clientId: { in: demoIds } },
        companyId: { notIn: demoIds },
        status: { in: [...ACTIVE_OFFER_STATUSES] },
      },
      select: { companyId: true, order: { select: { orderNumber: true, title: true } } },
    });

    // Каскадом уходят предложения, сдачи и файлы этих заказов; уведомления
    // других пользователей о них остаются без ссылки (`onDelete: SetNull`).
    await tx.order.deleteMany({ where: { clientId: { in: demoIds } } });

    if (outsiders.length > 0) {
      await tx.notification.createMany({
        data: outsiders.map(({ companyId, order }) => ({
          userId: companyId,
          type: NotificationType.ORDER_DELETED,
          orderId: null,
          title: notificationTypeLabels[NotificationType.ORDER_DELETED],
          body:
            `${orderRef(order)}: демо-заказ удалён плановым сбросом демо, ` +
            'ваше предложение больше не действует',
        })),
      });
    }
    // Предложения демо-компаний по чужим заказам: демо не должно оставлять
    // следов у настоящих пользователей дольше одного цикла. Кроме тех, что
    // ещё в игре: на них держится статус чужого заказа. Без отправленного
    // заказ остался бы «ждёт подтверждения» без единого предложения, без
    // принятого — «в работе» без исполнителя, и сдвинуть его было бы нечем.
    // Это уже настоящая сделка настоящего пользователя, и сброс её не трогает.
    await tx.offer.deleteMany({
      where: { companyId: { in: demoIds }, status: { notIn: [...ACTIVE_OFFER_STATUSES] } },
    });
    await tx.notification.deleteMany({ where: { userId: { in: demoIds } } });

    for (const user of DEMO_USERS) {
      // Метка сброса — `updatedAt` этой записи (см. `lastDemoReset`).
      // oxlint-disable-next-line no-await-in-loop
      await tx.user.update({
        where: { id: ids.get(user.key)! },
        data: demoProfile(user),
      });
    }

    await createDemoOrders(tx, ids);
    await createDemoNotifications(tx, ids);

    return {
      keys: files.map((file) => file.storageKey),
      notifiedCompanies: outsiders.length,
    };
  }, RESET_TX_OPTIONS);

  if (reset === null) {
    return null;
  }

  const { keys, notifiedCompanies } = reset;

  // После коммита: удалить объекты раньше — значит оставить строки без файлов,
  // если транзакция откатится.
  const doomed = [...new Set([...orphanKeys, ...keys])];
  await deps.removeObjects(doomed);

  return { recreatedUsers: recreated, removedObjects: doomed.length, notifiedCompanies };
}

/**
 * Найти демо-учётки и завести недостающие.
 *
 * Возвращает и ключи объектов тех заказов, которые исчезнут вместе
 * с пересозданными учётками: их строки уходят каскадом от `auth.users`,
 * и после этого в бакете остались бы файлы, на которые никто не ссылается.
 */
async function ensureDemoUsers(deps: DemoResetDeps): Promise<{
  ids: DemoUserIds;
  recreated: number;
  orphanKeys: string[];
}> {
  const emails = new Set(DEMO_USERS.map((user) => user.email));
  const found = new Map(
    (await findAuthUsersWhere(deps.admin, (email) => emails.has(email))).map(
      (user) => [user.email!.toLowerCase(), user],
    ),
  );

  const ids = new Map<DemoUserKey, string>();
  const missing = DEMO_USERS.filter((user) => {
    const existing = found.get(user.email);
    if (existing && isDemoAuthUser(existing)) {
      ids.set(user.key, existing.id);
      return false;
    }
    return true;
  });

  if (missing.length === 0) {
    return { ids, recreated: 0, orphanKeys: [] };
  }

  const replaced = missing.flatMap((user) => found.get(user.email)?.id ?? []);
  const orphanKeys =
    replaced.length === 0
      ? []
      : (
          await deps.prisma.orderFile.findMany({
            where: { order: { clientId: { in: replaced } } },
            select: { storageKey: true },
          })
        ).map((file) => file.storageKey);

  await deleteAuthUsers(deps.admin, replaced);

  for (const user of missing) {
    // Admin API по одному: учётки немного, а параллельные вставки в auth.users
    // ничего не выигрывают.
    // oxlint-disable-next-line no-await-in-loop
    const created = await createAuthUser(deps.admin, {
      email: user.email,
      password: deps.password,
      metadata: user.metadata,
      demo: true,
    });
    ids.set(user.key, created.id);
  }

  return { ids, recreated: missing.length, orphanKeys };
}
