import { describe, expect, it } from 'vitest';

import { OfferStatus } from './enums.js';
import {
  ACTIVE_OFFER_STATUSES,
  EXECUTING_OFFER_STATUSES,
  EXECUTOR_OFFER_STATUSES,
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
