/**
 * Демо и настоящие пользователи живут в разных мирах.
 *
 * Демо-учётки с экрана входа общие: под демо-компанией сидит любой посетитель.
 * Пусти их к настоящим клиентам — и кто угодно слал бы им предложения с любым
 * текстом, а принятое предложение открывало бы имя, телефон и email клиента
 * каждому, кто войдёт в демо (контакты видят стороны сделки). В обратную
 * сторону заказы демо-клиента с любым текстом попадали бы в ленту настоящих
 * компаний. Поэтому компания видит заказы, шлёт предложения и принимается
 * исполнителем только в своём мире, а каталог показывает клиенту компании
 * только его мира.
 *
 * Мир пользователя — его адрес: демо-учётки перечислены в `DEMO_EMAILS`,
 * и email им сменить нельзя (триггер `on_auth_user_demo_lock`). Тот же список
 * ставит учёткам флаг `app_metadata.demo` (seed), поэтому для того, кто делает
 * запрос, хватает `AuthUser.isDemo` из токена, а для второй стороны — адреса
 * из базы.
 */

import { DEMO_EMAILS } from '@mybuild/shared';

import type { Prisma } from '../generated/prisma/client.js';

const DEMO_EMAIL_LIST: string[] = Object.values(DEMO_EMAILS);

/** Демо-учётка ли это по адресу из базы. */
export function isDemoEmail(email: string | null | undefined): boolean {
  return email !== null && email !== undefined && DEMO_EMAIL_LIST.includes(email.toLowerCase());
}

/** Условие на пользователя «из того же мира, что и смотрящий». */
export function sameWorldUser(viewerIsDemo: boolean): Prisma.UserWhereInput {
  return { email: viewerIsDemo ? { in: DEMO_EMAIL_LIST } : { notIn: DEMO_EMAIL_LIST } };
}
