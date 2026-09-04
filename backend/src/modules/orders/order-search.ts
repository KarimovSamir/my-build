/**
 * Поиск по списку заказов (ТЗ §4.1): номер заказа, название заказа,
 * название подрядчика.
 *
 * Отдельный модуль без Nest и без базы — правила поиска проверяются
 * unit-тестами, а не только прогоном по живым данным.
 */

import { EXECUTOR_OFFER_STATUSES, parseOrderNumber } from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Экранировать символы, которые LIKE считает подстановочными.
 *
 * `contains` в Prisma превращается в `LIKE '%запрос%'`, поэтому без
 * экранирования запрос «%» совпадает со всеми заказами, а «_» — с любым
 * символом. Пользователь ищет строку, а не шаблон. Обратная косая черта
 * идёт первой: иначе она экранировала бы уже добавленные нами символы.
 */
export function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export function buildSearchConditions(query: string): Prisma.OrderWhereInput[] {
  const text = escapeLike(query);

  const conditions: Prisma.OrderWhereInput[] = [
    { title: { contains: text, mode: 'insensitive' } },
    {
      // Подрядчик — это компания, чьё предложение приняли. Предложения тех,
      // кого не выбрали, в поиск не попадают: подрядчиками они не стали.
      offers: {
        some: {
          status: { in: [...EXECUTOR_OFFER_STATUSES] },
          company: { companyName: { contains: text, mode: 'insensitive' } },
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
