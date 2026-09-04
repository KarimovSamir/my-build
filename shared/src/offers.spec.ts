import { describe, expect, it } from 'vitest';

import { OfferStatus, OrderStatus } from './enums.js';
import {
  ACTIVE_OFFER_STATUSES,
  EXECUTING_OFFER_STATUSES,
  EXECUTOR_OFFER_STATUSES,
  OFFER_PRICE_PATTERN,
  acceptsOffers,
  canResubmitOffer,
  isActiveOffer,
  isExecutorOffer,
} from './offers.js';

/**
 * Списки статусов предложения решают, кто участник заказа: по ним backend
 * отдаёт файлы и детали, а интерфейс выбирает текст пустого списка.
 * Проверяются все восемь статусов, а не выборочно (находка Т-Н3).
 */

describe('isExecutorOffer', () => {
  it.each([
    OfferStatus.ACCEPTED,
    OfferStatus.WORK_SUBMITTED,
    OfferStatus.BACK_FOR_OVERRIDE,
    OfferStatus.COMPLETED,
  ])('считает компанию исполнителем при статусе %s', (status) => {
    expect(isExecutorOffer(status)).toBe(true);
  });

  it.each([
    OfferStatus.SENT,
    OfferStatus.REJECTED,
    OfferStatus.NOT_ACCEPTED,
    OfferStatus.WITHDRAWN,
  ])('не считает исполнителем при статусе %s', (status) => {
    expect(isExecutorOffer(status)).toBe(false);
  });
});

describe('isActiveOffer', () => {
  it('отправленное предложение — ещё в игре, хотя исполнителем не делает', () => {
    expect(isActiveOffer(OfferStatus.SENT)).toBe(true);
    expect(isExecutorOffer(OfferStatus.SENT)).toBe(false);
  });

  it.each([OfferStatus.REJECTED, OfferStatus.NOT_ACCEPTED, OfferStatus.WITHDRAWN])(
    'выбывшее предложение активным не считается: %s',
    (status) => {
      expect(isActiveOffer(status)).toBe(false);
    },
  );

  it('завершённое предложение остаётся активным: доступ к заказу не пропадает', () => {
    expect(isActiveOffer(OfferStatus.COMPLETED)).toBe(true);
  });
});

describe('acceptsOffers', () => {
  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION])(
    'заказ в статусе %s ещё принимает предложения',
    (status) => {
      expect(acceptsOffers(status)).toBe(true);
    },
  );

  it.each([
    OrderStatus.IN_PROGRESS,
    OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    OrderStatus.COMPLETION_DISPUTED,
    OrderStatus.COMPLETED,
  ])('заказ в статусе %s предложений уже не принимает', (status) => {
    expect(acceptsOffers(status)).toBe(false);
  });
});

describe('canResubmitOffer', () => {
  it.each([OfferStatus.WITHDRAWN, OfferStatus.REJECTED])(
    'после статуса %s компания вправе прислать предложение заново',
    (status) => {
      expect(canResubmitOffer(status)).toBe(true);
    },
  );

  it('пока предложение в SENT, оно не «выбывшее» — обновляется на месте', () => {
    expect(canResubmitOffer(OfferStatus.SENT)).toBe(false);
  });

  it.each([
    OfferStatus.ACCEPTED,
    OfferStatus.WORK_SUBMITTED,
    OfferStatus.BACK_FOR_OVERRIDE,
    OfferStatus.COMPLETED,
    OfferStatus.NOT_ACCEPTED,
  ])('в ленту заказ со статусом предложения %s не возвращается', (status) => {
    expect(canResubmitOffer(status)).toBe(false);
  });
});

describe('OFFER_PRICE_PATTERN', () => {
  it.each(['1', '150000', '150000.5', '150000.50', '0.01', '9999999999.99'])(
    'принимает сумму %s',
    (value) => {
      expect(OFFER_PRICE_PATTERN.test(value)).toBe(true);
    },
  );

  it.each(['0', '0.0', '0.00', '00.00'])('отклоняет нулевую цену %s', (value) => {
    // Работа за ноль — не предложение, а ошибка ввода.
    expect(OFFER_PRICE_PATTERN.test(value)).toBe(false);
  });

  it.each(['', '-100', '100.555', '1e5', '100 ', '10000000000', 'сто'])(
    'отклоняет %s',
    (value) => {
      expect(OFFER_PRICE_PATTERN.test(value)).toBe(false);
    },
  );
});

describe('списки статусов выведены один из другого', () => {
  it('исполнитель — это «работает сейчас» плюс завершение', () => {
    expect([...EXECUTOR_OFFER_STATUSES]).toEqual([
      ...EXECUTING_OFFER_STATUSES,
      OfferStatus.COMPLETED,
    ]);
  });

  it('активные — это исполнитель плюс отправленное предложение', () => {
    expect([...ACTIVE_OFFER_STATUSES]).toEqual([
      OfferStatus.SENT,
      ...EXECUTOR_OFFER_STATUSES,
    ]);
  });

  it('в «работает сейчас» нет завершённого предложения', () => {
    expect(EXECUTING_OFFER_STATUSES).not.toContain(OfferStatus.COMPLETED);
  });

  it('каждый статус попадает ровно в один класс: активный или выбывший', () => {
    const leftovers = Object.values(OfferStatus).filter(
      (status) => !isActiveOffer(status),
    );

    expect(leftovers).toEqual([
      OfferStatus.REJECTED,
      OfferStatus.NOT_ACCEPTED,
      OfferStatus.WITHDRAWN,
    ]);
  });
});
