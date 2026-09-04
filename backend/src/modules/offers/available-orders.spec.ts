import { describe, expect, it } from 'vitest';

import { OfferStatus, OrderStatus } from '@mybuild/shared';

import { buildAvailableOrdersWhere } from './available-orders.js';

/**
 * Условие ленты доступных заказов (ТЗ §4.1).
 *
 * Проверяется здесь, а не только в e2e, потому что цена ошибки высокая
 * с обеих сторон: слишком широкое условие показывает компании заказ,
 * по которому она уже работает, слишком узкое — навсегда прячет заказ,
 * с которого она отозвала предложение.
 */

const COMPANY = '33333333-3333-4333-8333-333333333333';

describe('buildAvailableOrdersWhere', () => {
  it('берёт только заказы, которые ещё ищут исполнителя', () => {
    const where = buildAvailableOrdersWhere(COMPANY);

    expect(where.status).toEqual({
      in: [OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION],
    });
  });

  it('пускает заказ без предложения этой компании и с выбывшим предложением', () => {
    const [availability] = buildAvailableOrdersWhere(COMPANY).AND as [
      { OR: unknown[] },
    ];

    expect(availability.OR).toEqual([
      { offers: { none: { companyId: COMPANY } } },
      {
        offers: {
          some: {
            companyId: COMPANY,
            status: { in: [OfferStatus.WITHDRAWN, OfferStatus.REJECTED] },
          },
        },
      },
    ]);
  });

  it('без поиска других условий не добавляет', () => {
    expect(buildAvailableOrdersWhere(COMPANY).AND).toHaveLength(1);
  });

  it('поиск идёт отдельным условием, а не поверх доступности', () => {
    // Оба условия — `OR`. Соседними ключами их не положить: второй затёр бы
    // первый, и лента отдала бы заказы, по которым компания уже работает.
    const conditions = buildAvailableOrdersWhere(COMPANY, 'кровля').AND as {
      OR: unknown[];
    }[];

    expect(conditions).toHaveLength(2);
    expect(conditions[1]!.OR).toEqual([
      { title: { contains: 'кровля', mode: 'insensitive' } },
    ]);
  });

  it('ищет по номеру заказа так же, как список клиента', () => {
    const conditions = buildAvailableOrdersWhere(COMPANY, 'ORD-7829').AND as {
      OR: unknown[];
    }[];

    expect(conditions[1]!.OR).toContainEqual({ orderNumber: 7829 });
  });

  it('по названию подрядчика не ищет: у заказа в ленте исполнителя нет', () => {
    const conditions = buildAvailableOrdersWhere(COMPANY, 'Строймир').AND as {
      OR: Record<string, unknown>[];
    }[];

    expect(conditions[1]!.OR.some((condition) => 'offers' in condition)).toBe(false);
  });
});
