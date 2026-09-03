import { NotificationType, OfferStatus, OrderStatus } from '@mybuild/shared';
import { describe, expect, it } from 'vitest';

import {
  InvalidOfferStatusError,
  InvalidStateTransitionError,
  OrderEvent,
  OrderEventType,
  OrderStateContext,
  OrderStateMachine,
} from './order-state-machine.js';

const machine = new OrderStateMachine();

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const OFFER_ID = '33333333-3333-4333-8333-333333333333';
const RIVAL_COMPANY_ID = '55555555-5555-4555-8555-555555555555';
const RIVAL_OFFER_ID = '66666666-6666-4666-8666-666666666666';

function contextIn(status: OrderStatus): OrderStateContext {
  return {
    orderId: '44444444-4444-4444-8444-444444444444',
    orderNumber: 7829,
    title: 'Ремонт квартиры 100м²',
    clientId: CLIENT_ID,
    status,
  };
}

/** Предложение, по которому пришло событие, в подходящем для него статусе. */
function offerRef(offerStatus: OfferStatus) {
  return { offerId: OFFER_ID, companyId: COMPANY_ID, offerStatus };
}

/**
 * По одному событию каждого типа — этого хватает, чтобы обойти всю матрицу.
 * Статус предложения у каждого свой: событию подходят не любые (см. таблицу
 * `OFFER_PRECONDITIONS`), а матрица проверяет именно статусы заказа.
 *
 * Тип у каждого ключа свой, а не общий `OrderEvent`: иначе к событию нельзя
 * было бы дописать поле, не перечисляя заново все остальные.
 */
const events: { [T in OrderEventType]: Extract<OrderEvent, { type: T }> } = {
  OFFER_SUBMITTED: {
    type: OrderEventType.OFFER_SUBMITTED,
    ...offerRef(OfferStatus.SENT),
    companyName: 'ООО «Стройка»',
  },
  OFFER_WITHDRAWN: {
    type: OrderEventType.OFFER_WITHDRAWN,
    ...offerRef(OfferStatus.SENT),
    otherActiveOffers: 0,
  },
  OFFER_REJECTED: {
    type: OrderEventType.OFFER_REJECTED,
    ...offerRef(OfferStatus.SENT),
    otherActiveOffers: 0,
  },
  OFFER_ACCEPTED: {
    type: OrderEventType.OFFER_ACCEPTED,
    ...offerRef(OfferStatus.SENT),
    proposedPrice: '12500.00',
    proposedDeadline: new Date('2026-12-01T00:00:00.000Z'),
    otherOffers: [],
  },
  WORK_SUBMITTED: {
    type: OrderEventType.WORK_SUBMITTED,
    ...offerRef(OfferStatus.ACCEPTED),
  },
  WORK_CONFIRMED: {
    type: OrderEventType.WORK_CONFIRMED,
    ...offerRef(OfferStatus.WORK_SUBMITTED),
  },
  WORK_DISPUTED: {
    type: OrderEventType.WORK_DISPUTED,
    ...offerRef(OfferStatus.WORK_SUBMITTED),
    correctionComment: 'Переделать швы в санузле',
  },
};

/**
 * Таблица переходов ТЗ §4 в виде ожиданий теста — записана независимо от
 * реализации, чтобы тест ловил расхождение, а не повторял код машины.
 * Для отзыва и отклонения здесь `otherActiveOffers: 0`, то есть выбывает
 * последнее активное предложение; ветка «остались другие» проверяется ниже.
 */
const ALLOWED: Partial<Record<`${OrderStatus}/${OrderEventType}`, OrderStatus>> = {
  'WAITING/OFFER_SUBMITTED': OrderStatus.AWAITING_CONFIRMATION,
  'AWAITING_CONFIRMATION/OFFER_SUBMITTED': OrderStatus.AWAITING_CONFIRMATION,
  'AWAITING_CONFIRMATION/OFFER_WITHDRAWN': OrderStatus.WAITING,
  'AWAITING_CONFIRMATION/OFFER_REJECTED': OrderStatus.WAITING,
  'AWAITING_CONFIRMATION/OFFER_ACCEPTED': OrderStatus.IN_PROGRESS,
  'IN_PROGRESS/WORK_SUBMITTED': OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
  'AWAITING_COMPLETION_CONFIRMATION/WORK_CONFIRMED': OrderStatus.COMPLETED,
  'AWAITING_COMPLETION_CONFIRMATION/WORK_DISPUTED': OrderStatus.COMPLETION_DISPUTED,
  'COMPLETION_DISPUTED/WORK_SUBMITTED': OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
};

const allStatuses = Object.values(OrderStatus);
const allEvents = Object.values(OrderEventType);

const matrix = allStatuses.flatMap((status) =>
  allEvents.map((event) => ({
    status,
    event,
    expected: ALLOWED[`${status}/${event}`],
  })),
);

const allowedPairs = matrix.filter((cell) => cell.expected !== undefined);
const forbiddenPairs = matrix.filter((cell) => cell.expected === undefined);

describe('OrderStateMachine — матрица переходов', () => {
  it('покрывает все сочетания статуса и события', () => {
    expect(matrix).toHaveLength(allStatuses.length * allEvents.length);
    expect(allowedPairs).toHaveLength(9);
    expect(forbiddenPairs).toHaveLength(33);
  });

  it.each(allowedPairs)(
    'разрешает $event в статусе $status → $expected',
    ({ status, event, expected }) => {
      const result = machine.transition(contextIn(status), events[event]);

      expect(result.fromStatus).toBe(status);
      expect(result.nextStatus).toBe(expected);
      expect(machine.can(status, event)).toBe(true);
    },
  );

  it.each(forbiddenPairs)(
    'запрещает $event в статусе $status',
    ({ status, event }) => {
      expect(() => machine.transition(contextIn(status), events[event])).toThrow(
        InvalidStateTransitionError,
      );
      expect(machine.can(status, event)).toBe(false);
    },
  );

  it('отдаёт 409 с понятной ошибкой на запрещённый переход', () => {
    try {
      machine.transition(
        contextIn(OrderStatus.COMPLETED),
        events.WORK_SUBMITTED,
      );
      expect.unreachable('переход должен был упасть');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStateTransitionError);
      const response = (error as InvalidStateTransitionError).getResponse();
      expect((error as InvalidStateTransitionError).getStatus()).toBe(409);
      expect(response).toMatchObject({
        statusCode: 409,
        error: 'InvalidStateTransition',
      });
    }
  });
});

describe('OrderStateMachine — побочные эффекты', () => {
  it('предложение компании: статус SENT и уведомление клиенту', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.WAITING),
      events.OFFER_SUBMITTED,
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.SENT,
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: CLIENT_ID,
        type: NotificationType.OFFER_RECEIVED,
        body: expect.stringContaining('ORD-7829'),
      }),
    );
  });

  it('принятие предложения: цена, срок и уведомление компании', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_CONFIRMATION),
      events.OFFER_ACCEPTED,
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.ACCEPTED,
    });
    expect(effects).toContainEqual({
      kind: 'SET_ORDER_DEAL',
      price: '12500.00',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: COMPANY_ID,
        type: NotificationType.OFFER_ACCEPTED,
      }),
    );
  });

  it('проигравшее предложение получает и статус, и уведомление компании', () => {
    const { effects } = machine.transition(contextIn(OrderStatus.AWAITING_CONFIRMATION), {
      ...events.OFFER_ACCEPTED,
      type: OrderEventType.OFFER_ACCEPTED,
      otherOffers: [{ offerId: RIVAL_OFFER_ID, companyId: RIVAL_COMPANY_ID }],
    });

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: RIVAL_OFFER_ID,
      companyId: RIVAL_COMPANY_ID,
      status: OfferStatus.NOT_ACCEPTED,
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: RIVAL_COMPANY_ID,
        type: NotificationType.OFFER_REJECTED,
      }),
    );
  });

  it('без других предложений принятие не трогает чужие статусы', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_CONFIRMATION),
      events.OFFER_ACCEPTED,
    );

    expect(effects.filter((effect) => effect.kind === 'SET_OFFER_STATUS')).toHaveLength(1);
    expect(effects.filter((effect) => effect.kind === 'CREATE_NOTIFICATION')).toHaveLength(
      1,
    );
  });

  it('отзыв предложения оставляет заказ в выборе, пока есть другие активные', () => {
    const result = machine.transition(contextIn(OrderStatus.AWAITING_CONFIRMATION), {
      ...events.OFFER_WITHDRAWN,
      type: OrderEventType.OFFER_WITHDRAWN,
      otherActiveOffers: 2,
    });

    expect(result.nextStatus).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(result.effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.WITHDRAWN,
    });
  });

  it('отзыв последнего предложения возвращает заказ в поиск исполнителя', () => {
    const result = machine.transition(
      contextIn(OrderStatus.AWAITING_CONFIRMATION),
      events.OFFER_WITHDRAWN,
    );

    expect(result.nextStatus).toBe(OrderStatus.WAITING);
  });

  it('отзыв не создаёт уведомлений: компания отзывает своё предложение сама', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_CONFIRMATION),
      events.OFFER_WITHDRAWN,
    );

    expect(effects.filter((effect) => effect.kind === 'CREATE_NOTIFICATION')).toHaveLength(
      0,
    );
  });

  it('отклонение предложения уведомляет компанию', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_CONFIRMATION),
      events.OFFER_REJECTED,
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.REJECTED,
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: COMPANY_ID,
        type: NotificationType.OFFER_REJECTED,
      }),
    );
  });

  it('сдача работы уведомляет клиента и переводит предложение в WORK_SUBMITTED', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.IN_PROGRESS),
      events.WORK_SUBMITTED,
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.WORK_SUBMITTED,
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: CLIENT_ID,
        type: NotificationType.WORK_SUBMITTED,
      }),
    );
  });

  it('приёмка сохраняет комментарий клиента и завершает предложение', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_COMPLETION_CONFIRMATION),
      {
        type: OrderEventType.WORK_CONFIRMED,
        ...offerRef(OfferStatus.WORK_SUBMITTED),
        completionComment: 'Всё принято, спасибо',
      },
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.COMPLETED,
    });
    expect(effects).toContainEqual({
      kind: 'SET_COMPLETION_COMMENT',
      comment: 'Всё принято, спасибо',
    });
  });

  it('доработка сохраняет комментарий и возвращает предложение исполнителю', () => {
    const { effects } = machine.transition(
      contextIn(OrderStatus.AWAITING_COMPLETION_CONFIRMATION),
      events.WORK_DISPUTED,
    );

    expect(effects).toContainEqual({
      kind: 'SET_OFFER_STATUS',
      offerId: OFFER_ID,
      companyId: COMPANY_ID,
      status: OfferStatus.BACK_FOR_OVERRIDE,
    });
    expect(effects).toContainEqual({
      kind: 'SET_CORRECTION_COMMENT',
      comment: 'Переделать швы в санузле',
    });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'CREATE_NOTIFICATION',
        userId: COMPANY_ID,
        type: NotificationType.WORK_DISPUTED,
      }),
    );
  });
});

describe('OrderStateMachine — статус предложения', () => {
  it('не даёт отклонить уже отклонённое предложение, пока заказ ждёт выбора', () => {
    expect(() =>
      machine.transition(contextIn(OrderStatus.AWAITING_CONFIRMATION), {
        ...events.OFFER_REJECTED,
        type: OrderEventType.OFFER_REJECTED,
        offerStatus: OfferStatus.REJECTED,
      }),
    ).toThrow(InvalidOfferStatusError);
  });

  it('не даёт принять отозванное предложение', () => {
    expect(() =>
      machine.transition(contextIn(OrderStatus.AWAITING_CONFIRMATION), {
        ...events.OFFER_ACCEPTED,
        type: OrderEventType.OFFER_ACCEPTED,
        offerStatus: OfferStatus.WITHDRAWN,
      }),
    ).toThrow(InvalidOfferStatusError);
  });

  it('разрешает компании прислать предложение заново после отказа клиента', () => {
    const result = machine.transition(contextIn(OrderStatus.WAITING), {
      ...events.OFFER_SUBMITTED,
      type: OrderEventType.OFFER_SUBMITTED,
      offerStatus: OfferStatus.REJECTED,
    });

    expect(result.nextStatus).toBe(OrderStatus.AWAITING_CONFIRMATION);
  });

  it('не даёт сдать работу по предложению, которое уже на приёмке', () => {
    expect(() =>
      machine.transition(contextIn(OrderStatus.IN_PROGRESS), {
        ...events.WORK_SUBMITTED,
        type: OrderEventType.WORK_SUBMITTED,
        offerStatus: OfferStatus.WORK_SUBMITTED,
      }),
    ).toThrow(InvalidOfferStatusError);
  });

  it('отдаёт 409 с понятной ошибкой', () => {
    try {
      machine.transition(contextIn(OrderStatus.AWAITING_CONFIRMATION), {
        ...events.OFFER_REJECTED,
        type: OrderEventType.OFFER_REJECTED,
        offerStatus: OfferStatus.NOT_ACCEPTED,
      });
      expect.unreachable('переход должен был упасть');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOfferStatusError);
      expect((error as InvalidOfferStatusError).getStatus()).toBe(409);
      expect((error as InvalidOfferStatusError).getResponse()).toMatchObject({
        statusCode: 409,
        error: 'InvalidOfferStatus',
      });
    }
  });

  it('статус заказа проверяется раньше статуса предложения', () => {
    expect(() =>
      machine.transition(contextIn(OrderStatus.COMPLETED), {
        ...events.OFFER_REJECTED,
        type: OrderEventType.OFFER_REJECTED,
        offerStatus: OfferStatus.NOT_ACCEPTED,
      }),
    ).toThrow(InvalidStateTransitionError);
  });
});

describe('OrderStateMachine — полный цикл заказа', () => {
  /**
   * Прогоняет цепочку событий, подставляя результат прошлого шага в контекст.
   * Статус предложения тоже переносится с шага на шаг — иначе цепочка
   * проверяла бы только половину правил.
   */
  function walk(from: OrderStatus, chain: OrderEvent[]): OrderStatus {
    let status = from;
    let offerStatus: OfferStatus = OfferStatus.SENT;

    for (const event of chain) {
      const result = machine.transition(contextIn(status), { ...event, offerStatus });
      status = result.nextStatus;

      const update = result.effects.find(
        (effect) => effect.kind === 'SET_OFFER_STATUS' && effect.offerId === OFFER_ID,
      );
      if (update?.kind === 'SET_OFFER_STATUS') {
        offerStatus = update.status;
      }
    }

    return status;
  }

  it('создан → предложение → принято → сдано → принято = завершён', () => {
    expect(
      walk(OrderStatus.WAITING, [
        events.OFFER_SUBMITTED,
        events.OFFER_ACCEPTED,
        events.WORK_SUBMITTED,
        events.WORK_CONFIRMED,
      ]),
    ).toBe(OrderStatus.COMPLETED);
  });

  it('сдано → доработка → пересдано → принято = завершён', () => {
    expect(
      walk(OrderStatus.WAITING, [
        events.OFFER_SUBMITTED,
        events.OFFER_ACCEPTED,
        events.WORK_SUBMITTED,
        events.WORK_DISPUTED,
        events.WORK_SUBMITTED,
        events.WORK_CONFIRMED,
      ]),
    ).toBe(OrderStatus.COMPLETED);
  });

  it('отозвавшая предложение компания снова видит заказ в поиске исполнителя', () => {
    expect(
      walk(OrderStatus.WAITING, [events.OFFER_SUBMITTED, events.OFFER_WITHDRAWN]),
    ).toBe(OrderStatus.WAITING);
  });
});
