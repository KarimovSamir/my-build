import { describe, expect, it } from 'vitest';

import { OfferStatus, OrderStatus } from './enums.js';
import { canResubmitOffer, isPendingOffer } from './offers.js';
import {
  OFFER_PRECONDITIONS,
  ORDER_TRANSITIONS,
  OrderEventType,
  canTransition,
} from './state.js';

const allStatuses = Object.values(OrderStatus);
const allEvents = Object.values(OrderEventType);
const allOfferStatuses = Object.values(OfferStatus);

/**
 * Таблица переходов ТЗ §4, выписанная руками.
 *
 * Смысл именно в независимости от `ORDER_TRANSITIONS`: сверять таблицу
 * с самой собой бесполезно. Правка правил обязана ронять этот список.
 */
const ALLOWED: Record<string, true | undefined> = {
  'WAITING/OFFER_SUBMITTED': true,
  'AWAITING_CONFIRMATION/OFFER_SUBMITTED': true,
  'AWAITING_CONFIRMATION/OFFER_WITHDRAWN': true,
  'AWAITING_CONFIRMATION/OFFER_REJECTED': true,
  'AWAITING_CONFIRMATION/OFFER_ACCEPTED': true,
  'IN_PROGRESS/WORK_SUBMITTED': true,
  'AWAITING_COMPLETION_CONFIRMATION/WORK_CONFIRMED': true,
  'AWAITING_COMPLETION_CONFIRMATION/WORK_DISPUTED': true,
  'COMPLETION_DISPUTED/WORK_SUBMITTED': true,
};

const matrix = allStatuses.flatMap((status) =>
  allEvents.map((event) => ({
    status,
    event,
    allowed: ALLOWED[`${status}/${event}`] === true,
  })),
);

describe('canTransition — матрица статусов и событий', () => {
  it('покрывает все сочетания', () => {
    expect(matrix).toHaveLength(allStatuses.length * allEvents.length);
    expect(matrix.filter((cell) => cell.allowed)).toHaveLength(9);
  });

  it.each(matrix)('$status + $event → $allowed', ({ status, event, allowed }) => {
    expect(canTransition(status, event)).toBe(allowed);
  });

  it('из завершённого заказа выходов нет', () => {
    expect(ORDER_TRANSITIONS[OrderStatus.COMPLETED]).toHaveLength(0);
  });
});

/**
 * Статус заказа не заменяет статуса предложения: пока заказ ждёт выбора
 * из нескольких предложений, он остаётся в `AWAITING_CONFIRMATION`.
 */
describe('canTransition — предусловия по статусу предложения', () => {
  const preconditionCases = allEvents.flatMap((event) =>
    allOfferStatuses.map((offerStatus) => ({
      event,
      offerStatus,
      allowed: OFFER_PRECONDITIONS[event].includes(offerStatus),
    })),
  );

  it('у каждого события есть список допустимых статусов предложения', () => {
    for (const event of allEvents) {
      expect(OFFER_PRECONDITIONS[event].length).toBeGreaterThan(0);
    }
  });

  it.each(preconditionCases.filter((cell) => !cell.allowed))(
    'запрещает $event предложению в статусе $offerStatus',
    ({ event, offerStatus }) => {
      // Берём статус заказа, в котором событие само по себе разрешено:
      // иначе проверка ничего не докажет.
      const status = allStatuses.find((candidate) => canTransition(candidate, event));

      expect(status).toBeDefined();
      expect(canTransition(status!, event, offerStatus)).toBe(false);
    },
  );

  it('отклонить дважды одно предложение нельзя', () => {
    expect(
      canTransition(
        OrderStatus.AWAITING_CONFIRMATION,
        OrderEventType.OFFER_REJECTED,
        OfferStatus.SENT,
      ),
    ).toBe(true);

    expect(
      canTransition(
        OrderStatus.AWAITING_CONFIRMATION,
        OrderEventType.OFFER_REJECTED,
        OfferStatus.REJECTED,
      ),
    ).toBe(false);
  });

  /**
   * Предусловие отправки и лента доступных заказов обязаны сходиться:
   * из статуса, который не попадает в ленту, компания не может и предложиться.
   */
  it.each(allOfferStatuses)(
    'отправка предложения из статуса %s разрешена ровно тогда, когда заказ виден в ленте',
    (offerStatus) => {
      expect(
        canTransition(
          OrderStatus.AWAITING_CONFIRMATION,
          OrderEventType.OFFER_SUBMITTED,
          offerStatus,
        ),
      ).toBe(isPendingOffer(offerStatus) || canResubmitOffer(offerStatus));
    },
  );

  it('проигравшее выбор предложение заново не отправляется', () => {
    expect(
      canTransition(
        OrderStatus.AWAITING_CONFIRMATION,
        OrderEventType.OFFER_SUBMITTED,
        OfferStatus.NOT_ACCEPTED,
      ),
    ).toBe(false);
  });

  it('пересдать работу можно и после доработки', () => {
    expect(
      canTransition(
        OrderStatus.COMPLETION_DISPUTED,
        OrderEventType.WORK_SUBMITTED,
        OfferStatus.BACK_FOR_OVERRIDE,
      ),
    ).toBe(true);
  });

  it('неподходящий статус заказа перевешивает подходящее предложение', () => {
    expect(
      canTransition(
        OrderStatus.COMPLETED,
        OrderEventType.WORK_SUBMITTED,
        OfferStatus.ACCEPTED,
      ),
    ).toBe(false);
  });

  it('без статуса предложения проверяется только статус заказа', () => {
    expect(
      canTransition(OrderStatus.AWAITING_CONFIRMATION, OrderEventType.OFFER_REJECTED),
    ).toBe(true);
  });

  it('null — предложения ещё нет, предусловию нечего проверять', () => {
    expect(canTransition(OrderStatus.WAITING, OrderEventType.OFFER_SUBMITTED, null)).toBe(
      true,
    );
  });
});
