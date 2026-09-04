import { describe, expect, it } from 'vitest';

import { OrderStatus } from './enums.js';
import {
  DELETABLE_ORDER_STATUSES,
  MONEY_PATTERN,
  ORDER_LIMITS,
  canDeleteOrder,
} from './orders.js';

/**
 * Правила заказа проверяются по обе стороны (DTO на backend, форма в браузере),
 * а сами жили без единого теста (находка Т-Н3).
 */

describe('canDeleteOrder', () => {
  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION])(
    'разрешает удалить заказ в статусе %s',
    (status) => {
      expect(canDeleteOrder(status)).toBe(true);
    },
  );

  it.each([
    OrderStatus.IN_PROGRESS,
    OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    OrderStatus.COMPLETION_DISPUTED,
    OrderStatus.COMPLETED,
  ])('запрещает удалить заказ в статусе %s', (status) => {
    expect(canDeleteOrder(status)).toBe(false);
  });

  it('решает по списку, а не по своему условию', () => {
    // Список общий с фронтом: кнопка «Удалить» показывается по нему же.
    for (const status of Object.values(OrderStatus)) {
      expect(canDeleteOrder(status)).toBe(DELETABLE_ORDER_STATUSES.includes(status));
    }
  });
});

describe('MONEY_PATTERN', () => {
  it.each(['0', '1', '150000', '150000.5', '150000.50', '9999999999.99'])(
    'принимает сумму %s',
    (value) => {
      expect(MONEY_PATTERN.test(value)).toBe(true);
    },
  );

  it.each([
    '',
    '-1',
    '1,5',
    '1.234',
    '10000000000',
    '1.',
    '.5',
    ' 1',
    '1 ',
    '1e3',
  ])('отклоняет %s', (value) => {
    expect(MONEY_PATTERN.test(value)).toBe(false);
  });

  it('покрывает колонку Decimal(12, 2) целиком', () => {
    // Десять знаков до точки и два после — ровно то, что помещается в колонку.
    expect(MONEY_PATTERN.test('9999999999.99')).toBe(true);
    expect(MONEY_PATTERN.test('99999999999.99')).toBe(false);
  });
});

describe('ORDER_LIMITS', () => {
  it('нижняя граница каждого текстового поля меньше верхней', () => {
    expect(ORDER_LIMITS.title.min).toBeLessThan(ORDER_LIMITS.title.max);
    expect(ORDER_LIMITS.description.min).toBeLessThan(ORDER_LIMITS.description.max);
    expect(ORDER_LIMITS.address.min).toBeLessThan(ORDER_LIMITS.address.max);
  });

  it('площадь ограничена двумя знаками после запятой', () => {
    expect(ORDER_LIMITS.squareMeters.maxDecimals).toBe(2);
    expect(ORDER_LIMITS.squareMeters.max).toBeGreaterThan(0);
  });
});
