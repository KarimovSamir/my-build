/**
 * Кто попадает в каталог подрядчиков и как в нём ищут (ТЗ §5, §7).
 *
 * Отдельный модуль без Nest и без базы — как `order-search.ts` у заказов:
 * правило отбора проверяется unit-тестами, а не только прогоном по живым данным.
 */

import { OfferStatus, Role } from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { escapeLike } from '../orders/order-search.js';

/**
 * Каталог — это все зарегистрированные компании.
 *
 * `companyName` в условии не для красоты: наружу он уходит обязательным полем
 * `ContractorCard.companyName`. В базе он `text?` с CHECK-ограничением
 * «обязателен для роли COMPANY» (ТЗ §3), то есть строк без названия быть
 * не может, — но условие делает это видимым и в запросе.
 *
 * Поиск идёт по названию и по городу. Город добавлен к названию намеренно:
 * карточка показывает именно эти два поля (ТЗ §7), и «найти подрядчика
 * в своём городе» — первое, зачем каталог открывают. Контакты в поиск
 * не входят: адресами и телефонами компании не ищут.
 */
export function buildContractorsWhere(query?: string): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: Role.COMPANY,
    companyName: { not: null },
  };

  if (query) {
    const text = escapeLike(query);

    where.OR = [
      { companyName: { contains: text, mode: 'insensitive' } },
      { city: { contains: text, mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * Что считается завершённым заказом компании.
 *
 * Ровно её предложения в статусе `COMPLETED`: этот статус ставит state-машина
 * на подтверждении выполнения (ТЗ §4), а значит считать нечего по самим
 * заказам — принятое предложение у заказа одно, и связь однозначна.
 */
export const COMPLETED_OFFERS_FILTER = { status: OfferStatus.COMPLETED } as const;
