import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { Role } from '@mybuild/shared';

/**
 * Клиент Supabase с секретным ключом — для операций, которые делает сервер
 * от своего имени: создание учётных записей в seed и в тестах.
 *
 * Ключ даёт полный доступ в обход RLS, поэтому модуль не должен попадать
 * ни во frontend, ни в код, отвечающий на запросы пользователей.
 *
 * Это не Nest-провайдер намеренно: им пользуются скрипты (seed) и e2e, где
 * контейнера зависимостей нет. Storage в Фазе 3 обернёт это в модуль.
 */
export function createSupabaseAdminClient(
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
): SupabaseClient {
  if (!url || !secretKey) {
    throw new Error(
      'Не заданы SUPABASE_URL и SUPABASE_SECRET_KEY в backend/.env ' +
        '(шаблон — backend/env.example)',
    );
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Метаданные регистрации: из них триггер собирает профиль (ТЗ §3). */
export interface AuthUserMetadata {
  role: Role;
  firstName: string;
  lastName?: string;
  phone: string;
  companyName?: string;
  city?: string;
  country?: string;
}

/**
 * Создать учётную запись с уже подтверждённым email.
 *
 * Профиль в public."User" появится сам — его создаст триггер on_auth_user_created.
 * Ошибка метаданных всплывёт прямо здесь: триггер отменит вставку.
 */
export async function createAuthUser(
  admin: SupabaseClient,
  params: { email: string; password: string; metadata: AuthUserMetadata },
): Promise<User> {
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: params.metadata,
  });

  if (error || !data.user) {
    throw new Error(
      `Не удалось создать пользователя ${params.email}: ${error?.message ?? 'пустой ответ'}`,
    );
  }

  return data.user;
}

/**
 * Удалить учётные записи, чей email подходит под условие. Профили и всё,
 * что к ним привязано, уходят каскадом по внешнему ключу на auth.users.
 *
 * Admin API не умеет искать по email, поэтому список перебирается страницами.
 */
export async function deleteAuthUsersWhere(
  admin: SupabaseClient,
  matches: (email: string) => boolean,
): Promise<number> {
  const perPage = 200;
  const ids: string[] = [];

  for (let page = 1; ; page += 1) {
    // Страницы можно читать только по очереди: сколько их всего, известно
    // лишь по тому, что последняя пришла неполной.
    // oxlint-disable-next-line no-await-in-loop
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Не удалось получить список пользователей: ${error.message}`);
    }

    for (const user of data.users) {
      if (user.email && matches(user.email.toLowerCase())) {
        ids.push(user.id);
      }
    }

    if (data.users.length < perPage) break;
  }

  const results = await Promise.all(
    ids.map(async (id) => ({ id, ...(await admin.auth.admin.deleteUser(id)) })),
  );

  const failed = results.find((result) => result.error);
  if (failed) {
    throw new Error(
      `Не удалось удалить пользователя ${failed.id}: ${failed.error?.message}`,
    );
  }

  return ids.length;
}

/** Удалить учётные записи с перечисленными адресами. */
export function deleteAuthUsersByEmail(
  admin: SupabaseClient,
  emails: string[],
): Promise<number> {
  if (emails.length === 0) return Promise.resolve(0);

  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  return deleteAuthUsersWhere(admin, (email) => wanted.has(email));
}
