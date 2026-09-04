import { describe, expect, it } from 'vitest';

import { OrderStatus } from './enums.js';
import {
  AREA_VERIFIABLE_ORDER_STATUSES,
  DELETABLE_ORDER_STATUSES,
  MONEY_PATTERN,
  ORDER_LIMITS,
  WORK_UPLOAD_ORDER_STATUSES,
  canDeleteOrder,
  canUploadWork,
  canVerifyArea,
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

describe('canUploadWork', () => {
  it.each([OrderStatus.IN_PROGRESS, OrderStatus.COMPLETION_DISPUTED])(
    'разрешает добавить файлы сдачи в статусе %s',
    (status) => {
      expect(canUploadWork(status)).toBe(true);
    },
  );

  it('запрещает дозагрузку, пока клиент проверяет сданную работу', () => {
    // Иначе компания молча меняла бы то, что клиент в этот момент смотрит.
    expect(canUploadWork(OrderStatus.AWAITING_COMPLETION_CONFIRMATION)).toBe(false);
  });

  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.COMPLETED])(
    'запрещает добавить файлы сдачи в статусе %s',
    (status) => {
      expect(canUploadWork(status)).toBe(false);
    },
  );

  it('решает по списку, а не по своему условию', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(canUploadWork(status)).toBe(WORK_UPLOAD_ORDER_STATUSES.includes(status));
    }
  });
});

describe('canVerifyArea', () => {
  it.each([
    OrderStatus.IN_PROGRESS,
    OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    OrderStatus.COMPLETION_DISPUTED,
  ])('разрешает уточнить площадь в статусе %s', (status) => {
    expect(canVerifyArea(status)).toBe(true);
  });

  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.COMPLETED])(
    'запрещает уточнить площадь в статусе %s',
    (status) => {
      expect(canVerifyArea(status)).toBe(false);
    },
  );

  it('решает по списку, а не по своему условию', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(canVerifyArea(status)).toBe(AREA_VERIFIABLE_ORDER_STATUSES.includes(status));
    }
  });

  it('шире, чем разрешение на загрузку файлов, ровно на проверку клиентом', () => {
    // Площадь уточняется и после сдачи, а файлы в сданный раунд — уже нет.
    const extra = AREA_VERIFIABLE_ORDER_STATUSES.filter(
      (status) => !WORK_UPLOAD_ORDER_STATUSES.includes(status),
    );

    expect(extra).toEqual([OrderStatus.AWAITING_COMPLETION_CONFIRMATION]);
    expect(
      WORK_UPLOAD_ORDER_STATUSES.every((status) =>
        AREA_VERIFIABLE_ORDER_STATUSES.includes(status),
      ),
    ).toBe(true);
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

  it('комментарий сдачи не может быть пустым', () => {
    expect(ORDER_LIMITS.comment.min).toBeGreaterThan(0);
    expect(ORDER_LIMITS.comment.min).toBeLessThan(ORDER_LIMITS.comment.max);
  });

  it('площадь ограничена двумя знаками после запятой', () => {
    expect(ORDER_LIMITS.squareMeters.maxDecimals).toBe(2);
    expect(ORDER_LIMITS.squareMeters.max).toBeGreaterThan(0);
  });
});
