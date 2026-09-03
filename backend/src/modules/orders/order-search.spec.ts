import { describe, expect, it } from 'vitest';

import { MAX_ORDER_NUMBER, OfferStatus } from '@mybuild/shared';

import { buildSearchConditions } from './order-search.js';

/**
 * Поиск по списку заказов (ТЗ §4.1).
 *
 * Отдельного внимания стоит номер заказа: колонка `orderNumber` — `Int`,
 * и число, которое в неё не помещается, роняло запрос уже в базе, то есть
 * длинная строка цифр в поисковой строке давала пользователю 500.
 */

/** Есть ли среди условий поиск по номеру заказа. */
function orderNumberIn(conditions: ReturnType<typeof buildSearchConditions>) {
  const found = conditions.find((condition) => 'orderNumber' in condition);
  return found ? (found as { orderNumber: number }).orderNumber : null;
}

describe('buildSearchConditions', () => {
  it('всегда ищет по названию заказа и по названию подрядчика', () => {
    const conditions = buildSearchConditions('кровля');

    expect(conditions).toHaveLength(2);
    expect(conditions[0]).toEqual({
      title: { contains: 'кровля', mode: 'insensitive' },
    });
    expect(conditions[1]).toEqual({
      offers: {
        some: {
          status: { in: expect.arrayContaining([OfferStatus.ACCEPTED]) },
          company: { companyName: { contains: 'кровля', mode: 'insensitive' } },
        },
      },
    });
  });

  it('добавляет поиск по номеру и с префиксом ORD-, и без него', () => {
    expect(orderNumberIn(buildSearchConditions('7829'))).toBe(7829);
    expect(orderNumberIn(buildSearchConditions('ORD-7829'))).toBe(7829);
    expect(orderNumberIn(buildSearchConditions('ord-7829'))).toBe(7829);
    expect(orderNumberIn(buildSearchConditions('  7829  '))).toBe(7829);
  });

  it('на обычное слово условия по номеру не добавляет', () => {
    expect(orderNumberIn(buildSearchConditions('ремонт'))).toBeNull();
    expect(orderNumberIn(buildSearchConditions('ORD-'))).toBeNull();
    expect(orderNumberIn(buildSearchConditions('78a29'))).toBeNull();
  });

  it('принимает наибольший возможный номер', () => {
    expect(orderNumberIn(buildSearchConditions(String(MAX_ORDER_NUMBER)))).toBe(
      MAX_ORDER_NUMBER,
    );
  });

  it('число, не помещающееся в колонку Int, номером не считается', () => {
    // Иначе запрос доходит до базы и падает там: «value out of range
    // for type integer» — то есть 500 на обычный ввод в строке поиска.
    expect(orderNumberIn(buildSearchConditions(String(MAX_ORDER_NUMBER + 1)))).toBeNull();
    expect(orderNumberIn(buildSearchConditions('99999999999'))).toBeNull();
    expect(orderNumberIn(buildSearchConditions('ORD-99999999999'))).toBeNull();
    expect(
      orderNumberIn(buildSearchConditions('123456789012345678901234567890')),
    ).toBeNull();
  });

  it('ноль номером не считается: нумерация начинается с единицы', () => {
    expect(orderNumberIn(buildSearchConditions('0'))).toBeNull();
    expect(orderNumberIn(buildSearchConditions('ORD-0'))).toBeNull();
  });

  it('строка из одних нулей не ломает разбор', () => {
    expect(orderNumberIn(buildSearchConditions('007829'))).toBe(7829);
  });
});
