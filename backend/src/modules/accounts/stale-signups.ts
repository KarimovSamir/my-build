/**
 * Неподтверждённые регистрации старше суток удаляются.
 *
 * Регистрация сразу создаёт учётку и профиль, ещё до подтверждения адреса.
 * Пока учётка висит неподтверждённой, адрес занят: повторная регистрация
 * настоящего владельца её не заменяет (GoTrue «не уверен, чей это адрес»),
 * а только шлёт письмо ещё раз — и подтверждает он профиль, заполненный
 * тем, кто зарегистрировался первым: роль, имя, телефон, название компании.
 * Пароль того, первого, подтверждение стирает (триггер
 * `on_auth_user_signup_confirmed`), но профиль остаётся чужим, и роль
 * в продукте не меняется. Сутки — срок жизни ссылки из письма: после них
 * такая учётка уже никому не нужна, а адрес освобождается.
 *
 * Заодно таблица `User` не копит профили, которые никто не подтвердил.
 *
 * Модуль без Nest: условие проверяется unit-тестом, таймер живёт в сервисе.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { deleteAuthUsers } from '../../supabase/supabase-admin.js';

/** Сколько живёт неподтверждённая регистрация — столько же, сколько ссылка из письма. */
export const STALE_SIGNUP_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Сколько учёток удаляется за один проход. Каждая — отдельный запрос
 * в Admin API; остальные уйдут на следующем шаге таймера.
 */
export const STALE_SIGNUP_BATCH = 50;

export interface StaleSignupDeps {
  prisma: Pick<PrismaClient, 'user'>;
  admin: SupabaseClient;
}

/**
 * Условие «регистрация не подтверждена и устарела». Время подтверждения
 * копирует в профиль триггер из `auth.users.email_confirmed_at`, поэтому
 * читать схему `auth` не нужно. Демо-учётки подтверждены с создания и сюда
 * не попадают.
 */
export function staleSignupsWhere(now: Date) {
  return {
    emailVerifiedAt: null,
    createdAt: { lt: new Date(now.getTime() - STALE_SIGNUP_AGE_MS) },
  };
}

/** Удалить устаревшие неподтверждённые учётки. Возвращает, сколько удалено. */
export async function deleteStaleSignups(
  deps: StaleSignupDeps,
  now: Date = new Date(),
): Promise<number> {
  const stale = await deps.prisma.user.findMany({
    where: staleSignupsWhere(now),
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: STALE_SIGNUP_BATCH,
  });

  // Через Admin API, а не запросом в auth.users: прямое удаление обошло бы
  // GoTrue. Профиль уходит каскадом по внешнему ключу.
  await deleteAuthUsers(
    deps.admin,
    stale.map((user) => user.id),
  );

  return stale.length;
}
