/**
 * Поиск по списку заказов (ТЗ §4.1): номер заказа, название заказа,
 * название подрядчика.
 *
 * Отдельный модуль без Nest и без базы — правила поиска проверяются
 * unit-тестами, а не только прогоном по живым данным.
 */

import { parseOrderNumber } from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { EXECUTOR_OFFER_STATUSES } from './order-participation.js';

export function buildSearchConditions(query: string): Prisma.OrderWhereInput[] {
  const conditions: Prisma.OrderWhereInput[] = [
    { title: { contains: query, mode: 'insensitive' } },
    {
      // Подрядчик — это компания, чьё предложение приняли. Предложения тех,
      // кого не выбрали, в поиск не попадают: подрядчиками они не стали.
      offers: {
        some: {
          status: { in: EXECUTOR_OFFER_STATUSES },
          company: { companyName: { contains: query, mode: 'insensitive' } },
        },
      },
    },
  ];

  // Номер добавляется, только если запрос действительно похож на номер:
  // иначе в `where` уехал бы `NaN`. `parseOrderNumber` заодно отсекает числа,
  // которые не помещаются в колонку `Int`, — база на таких падает.
  const orderNumber = parseOrderNumber(query);

  if (orderNumber !== null) {
    conditions.unshift({ orderNumber });
  }

  return conditions;
}
