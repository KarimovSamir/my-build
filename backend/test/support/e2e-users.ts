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
 * У каждого файла тестов — свой поддомен внутри `e2e.test`, и уборка идёт
 * только по нему (находка Т-Н2). Раньше уборка сносила всех по общему домену,
 * и два файла, запущенные одновременно, вытирали фикстуры друг друга; сейчас
 * это безопасно независимо от `fileParallelism`.
 *
 * По этому же поддомену подчищаются и следы прогонов, прерванных по таймауту:
 * такой прогон до `afterAll` не доходит, а `beforeAll` следующего — начинает
 * с уборки своего набора.
 */
const E2E_ROOT_DOMAIN = 'e2e.test';

/** Пароль тестовых учётных записей: вход по нему нужен только части тестов. */
export const E2E_PASSWORD = 'MyBuild-e2e-2026';

export interface E2eUser {
  id: string;
  email: string;
  password: string;
}

/** Набор пользователей одного файла тестов. */
export interface E2eSuite {
  /** Домен этого набора, например `@orders.e2e.test`. */
  readonly domain: string;
  createUser(
    prefix: string,
    overrides: Partial<AuthUserMetadata> & { role: Role },
    options?: { confirmEmail?: boolean },
  ): Promise<E2eUser>;
  dropUsers(): Promise<number>;
}

/**
 * Завести набор для файла тестов. `name` попадает в адреса пользователей
 * и в область уборки, поэтому у каждого файла он должен быть свой.
 */
export function e2eSuite(name: string): E2eSuite {
  const domain = `@${name}.${E2E_ROOT_DOMAIN}`;

  return {
    domain,

    /**
     * Завести учётную запись с подтверждённым email.
     * `prefix` попадает в адрес и помогает читать данные в базе при разборе падений.
     */
    async createUser(prefix, overrides, options = {}) {
      const email = `${prefix}-${randomUUID()}${domain}`;

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
    },

    /**
     * Удалить учётные записи только этого набора.
     * Профили, заказы, предложения и уведомления уходят каскадом.
     */
    dropUsers() {
      return deleteAuthUsersWhere(createSupabaseAdminClient(), (email) =>
        email.endsWith(domain),
      );
    },
  };
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
