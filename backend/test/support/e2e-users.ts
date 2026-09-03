import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import { Role } from '@mybuild/shared';

import {
  createAuthUser,
  createSupabaseAdminClient,
  deleteAuthUsersWhere,
  type AuthUserMetadata,
} from '../../src/supabase/supabase-admin.js';

/**
 * Пользователи для e2e.
 *
 * Профиль в public."User" больше нельзя создать напрямую: на таблице внешний
 * ключ на auth.users (Фаза 2). Поэтому тесты заводят настоящие учётные записи
 * через Admin API, а профили создаёт триггер.
 *
 * Адреса всегда в домене @e2e.test — по нему прогон подчищает и свои следы,
 * и следы прогонов, прерванных по таймауту.
 */
export const E2E_EMAIL_DOMAIN = '@e2e.test';

/** Пароль тестовых учётных записей: вход по нему нужен только части тестов. */
export const E2E_PASSWORD = 'MyBuild-e2e-2026';

export interface E2eUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Завести учётную запись с подтверждённым email.
 * `prefix` попадает в адрес и помогает читать данные в базе при разборе падений.
 */
export async function createE2eUser(
  prefix: string,
  overrides: Partial<AuthUserMetadata> & { role: Role },
  options: { confirmEmail?: boolean } = {},
): Promise<E2eUser> {
  const email = `${prefix}-${randomUUID()}${E2E_EMAIL_DOMAIN}`;

  const user = await createAuthUser(createSupabaseAdminClient(), {
    email,
    password: E2E_PASSWORD,
    confirmEmail: options.confirmEmail,
    metadata: {
      firstName: 'Тест',
      phone: '+7 900 000-00-00',
      // Название обязательно для роли COMPANY (ТЗ §3).
      ...(overrides.role === Role.COMPANY ? { companyName: 'ООО «Тест»' } : {}),
      ...overrides,
    },
  });

  return { id: user.id, email, password: E2E_PASSWORD };
}

/**
 * Войти паролем и получить access-токен — тем же способом, каким это делает
 * браузер. Токен нужен тестам, которые ходят в API через HTTP.
 */
export async function signInE2eUser(user: E2eUser): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    throw new Error(`Не удалось войти как ${user.email}: ${error?.message}`);
  }

  return data.session.access_token;
}

/**
 * Удалить все учётные записи домена @e2e.test.
 * Профили, заказы, предложения и уведомления уходят каскадом.
 */
export function dropE2eUsers(): Promise<number> {
  return deleteAuthUsersWhere(createSupabaseAdminClient(), (email) =>
    email.endsWith(E2E_EMAIL_DOMAIN),
  );
}
