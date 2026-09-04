import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXECUTING_OFFER_STATUSES,
  NotificationType,
  OfferStatus,
  OrderStatus,
} from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OrderEventType, OrderStateMachine } from './order-state-machine.js';
import { OrderTransitionService } from './order-transition.service.js';

/**
 * Обёртка машины без базы (находка Т-С3): что именно уходит в запросы
 * и в каком порядке.
 *
 * Сами переходы проверены `order-state-machine.spec.ts`, запись на живой базе —
 * `test/order-transition.e2e-spec.ts`. Здесь машина настоящая, а транзакция
 * подставная: видно, какие эффекты во что превращаются и что мусорный
 * идентификатор до базы не доходит.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_A = '33333333-3333-4333-8333-333333333333';
const COMPANY_B = '44444444-4444-4444-8444-444444444444';
const OFFER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OFFER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const DEADLINE = new Date('2027-03-01T00:00:00.000Z');

interface StubOffer {
  id: string;
  companyId: string;
  status: OfferStatus;
  proposedPrice: string;
  companyName?: string;
}

function orderRow(status: OrderStatus) {
  return {
    id: ORDER_ID,
    orderNumber: 42,
    title: 'Ремонт квартиры',
    clientId: CLIENT_ID,
    status,
  };
}

/** Условие выборки предложений в том объёме, в каком его строит сервис. */
interface OfferWhere {
  id?: string | { not: string };
  status?: OfferStatus | { in: OfferStatus[] };
}

/** Фильтрация «как в базе»: без неё тест не отличил бы исполнителя от любого. */
function matches(offer: StubOffer, where: OfferWhere): boolean {
  if (typeof where.id === 'string' && offer.id !== where.id) return false;
  if (where.id && typeof where.id === 'object' && offer.id === where.id.not) return false;
  if (typeof where.status === 'string' && offer.status !== where.status) return false;
  if (
    where.status &&
    typeof where.status === 'object' &&
    !where.status.in.includes(offer.status)
  ) {
    return false;
  }

  return true;
}

/**
 * Подставная транзакция. Предложения фильтрует по-настоящему: только так
 * видно, что исполнитель ищется по статусам, а проигравшие — по `SENT`.
 */
function createPrismaStub(options: {
  order?: ReturnType<typeof orderRow> | null;
  offers?: StubOffer[];
}) {
  const order = options.order === undefined ? orderRow(OrderStatus.WAITING) : options.order;
  const offers = options.offers ?? [];

  const toRow = (offer: StubOffer) => ({
    id: offer.id,
    companyId: offer.companyId,
    status: offer.status,
    proposedPrice: new Prisma.Decimal(offer.proposedPrice),
    proposedDeadline: DEADLINE,
    company: { companyName: offer.companyName ?? 'ООО «Тест»' },
  });

  const tx = {
    $queryRaw: vi.fn(async () => (order ? [{ id: order.id }] : [])),
    order: {
      findUniqueOrThrow: vi.fn(async () => order),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...order,
        ...data,
      })),
    },
    offer: {
      findFirst: vi.fn(async ({ where }: { where: OfferWhere }) => {
        const found = offers.find((offer) => matches(offer, where));
        return found ? toRow(found) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: OfferWhere }) =>
        offers.filter((offer) => matches(offer, where)).map(toRow),
      ),
      count: vi.fn(
        async ({ where }: { where: OfferWhere }) =>
          offers.filter((offer) => matches(offer, where)).length,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    notification: {
      createManyAndReturn: vi.fn(
        async ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((row, index) => ({ ...row, id: `notification-${index}` })),
      ),
    },
  };

  const prisma = {
    tx,
    $transaction: vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>, _options?: unknown) => fn(tx),
    ),
  };

  return prisma;
}

type PrismaStub = ReturnType<typeof createPrismaStub>;

function createService(prisma: PrismaStub): OrderTransitionService {
  return new OrderTransitionService(
    prisma as unknown as PrismaService,
    new OrderStateMachine(),
  );
}

/** Заказ, ждущий выбора, с двумя предложениями в `SENT`. */
function awaitingConfirmation() {
  return createPrismaStub({
    order: orderRow(OrderStatus.AWAITING_CONFIRMATION),
    offers: [
      {
        id: OFFER_A,
        companyId: COMPANY_A,
        status: OfferStatus.SENT,
        proposedPrice: '9500.00',
      },
      {
        id: OFFER_B,
        companyId: COMPANY_B,
        status: OfferStatus.SENT,
        proposedPrice: '11000.00',
      },
    ],
  });
}

describe('OrderTransitionService: поиск заказа и предложения', () => {
  it.each(['not-a-uuid', '', '1 OR 1=1'])(
    'на мусорный идентификатор заказа отдаёт 404 и в базу не ходит: %s',
    async (orderId) => {
      const prisma = createPrismaStub({});

      await expect(
        createService(prisma).apply({ type: OrderEventType.WORK_SUBMITTED, orderId }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.tx.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('на мусорный идентификатор предложения отдаёт 404', async () => {
    const prisma = awaitingConfirmation();

    await expect(
      createService(prisma).apply({
        type: OrderEventType.OFFER_ACCEPTED,
        orderId: ORDER_ID,
        offerId: 'not-a-uuid',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.tx.offer.findFirst).not.toHaveBeenCalled();
  });

  it('берёт строку заказа под блокировку до чтения', async () => {
    const prisma = awaitingConfirmation();

    await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    // FOR UPDATE обязан идти первым: иначе два одновременных перехода
    // прочитали бы один статус и записали поверх друг друга.
    expect(prisma.tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.tx.order.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
  });

  it('на несуществующий заказ отдаёт 404', async () => {
    const prisma = createPrismaStub({ order: null });

    await expect(
      createService(prisma).apply({
        type: OrderEventType.WORK_SUBMITTED,
        orderId: ORDER_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('на несуществующее предложение отдаёт 404', async () => {
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_CONFIRMATION),
      offers: [],
    });

    await expect(
      createService(prisma).apply({
        type: OrderEventType.OFFER_REJECTED,
        orderId: ORDER_ID,
        offerId: OFFER_A,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('без исполнителя у заказа отдаёт 409, а не 404', async () => {
    // Заказ есть, а компании, которая по нему работает, нет: это конфликт
    // состояния, а не «не найдено».
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.IN_PROGRESS),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.NOT_ACCEPTED,
          proposedPrice: '9500.00',
        },
      ],
    });

    await expect(
      createService(prisma).apply({
        type: OrderEventType.WORK_SUBMITTED,
        orderId: ORDER_ID,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('ищет исполнителя по статусам «компания работает по заказу»', async () => {
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.IN_PROGRESS),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.ACCEPTED,
          proposedPrice: '9500.00',
        },
      ],
    });

    const applied = await createService(prisma).apply({
      type: OrderEventType.WORK_SUBMITTED,
      orderId: ORDER_ID,
    });

    expect(applied.offerId).toBe(OFFER_A);
    expect(prisma.tx.offer.findFirst.mock.calls[0]![0].where).toMatchObject({
      status: { in: [...EXECUTING_OFFER_STATUSES] },
    });
  });

  it('статус предложения при поиске по id не фильтрует — это решает машина', async () => {
    const prisma = awaitingConfirmation();

    await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(prisma.tx.offer.findFirst.mock.calls[0]![0].where).not.toHaveProperty('status');
  });

  it('переход идёт одной транзакцией с запасом по времени', async () => {
    const prisma = awaitingConfirmation();

    await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0]![1]).toMatchObject({ timeout: 15_000 });
  });
});

describe('OrderTransitionService: запись эффектов', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = awaitingConfirmation();
  });

  it('принятие предложения пишет статусы, цену сделки и уведомления', async () => {
    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(applied.nextStatus).toBe(OrderStatus.IN_PROGRESS);
    expect(applied.fromStatus).toBe(OrderStatus.AWAITING_CONFIRMATION);

    // Победитель и проигравший получают разные статусы — значит, два запроса,
    // сгруппированных по статусу, а не по одному на предложение.
    expect(prisma.tx.offer.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.tx.offer.updateMany.mock.calls).toEqual(
      expect.arrayContaining([
        [{ where: { id: { in: [OFFER_A] } }, data: { status: OfferStatus.ACCEPTED } }],
        [{ where: { id: { in: [OFFER_B] } }, data: { status: OfferStatus.NOT_ACCEPTED } }],
      ]),
    );

    expect(prisma.tx.order.update.mock.calls[0]![0].data).toMatchObject({
      status: OrderStatus.IN_PROGRESS,
      price: '9500',
      deadline: DEADLINE,
    });
  });

  it('уведомляет и победителя, и проигравшего одним коммитом', async () => {
    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(prisma.tx.notification.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(applied.notifications).toHaveLength(2);
    expect(applied.notifications[0]).toMatchObject({
      userId: COMPANY_A,
      type: NotificationType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
    });
    expect(applied.notifications[1]).toMatchObject({
      userId: COMPANY_B,
      type: NotificationType.OFFER_REJECTED,
      orderId: ORDER_ID,
    });
  });

  it('отдаёт адресатов события `offer:status_changed`', async () => {
    // Фаза 5 берёт из `offerUpdates` всех, кому нужно разослать смену статуса.
    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(applied.offerUpdates).toEqual([
      { offerId: OFFER_A, companyId: COMPANY_A, status: OfferStatus.ACCEPTED },
      { offerId: OFFER_B, companyId: COMPANY_B, status: OfferStatus.NOT_ACCEPTED },
    ]);
  });

  it('считает оставшиеся предложения при отклонении', async () => {
    // У заказа остаётся предложение компании А, поэтому он не возвращается
    // в поиск исполнителя.
    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_REJECTED,
      orderId: ORDER_ID,
      offerId: OFFER_B,
    });

    expect(applied.nextStatus).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(prisma.tx.offer.count.mock.calls[0]![0].where).toMatchObject({
      orderId: ORDER_ID,
      status: OfferStatus.SENT,
      id: { not: OFFER_B },
    });
  });

  it('возвращает заказ в поиск, когда отклонено последнее предложение', async () => {
    const single = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_CONFIRMATION),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.SENT,
          proposedPrice: '9500.00',
        },
      ],
    });

    const applied = await createService(single).apply({
      type: OrderEventType.OFFER_REJECTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(applied.nextStatus).toBe(OrderStatus.WAITING);
  });

  it('пишет комментарий доработки в заказ', async () => {
    const inProgress = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_COMPLETION_CONFIRMATION),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.WORK_SUBMITTED,
          proposedPrice: '9500.00',
        },
      ],
    });

    await createService(inProgress).apply({
      type: OrderEventType.WORK_DISPUTED,
      orderId: ORDER_ID,
      correctionComment: 'Переделать швы',
    });

    expect(inProgress.tx.order.update.mock.calls[0]![0].data).toMatchObject({
      status: OrderStatus.COMPLETION_DISPUTED,
      correctionComment: 'Переделать швы',
    });
  });

  it('приёмка без комментария пишет `null`, а не пропускает поле', async () => {
    const submitted = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_COMPLETION_CONFIRMATION),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.WORK_SUBMITTED,
          proposedPrice: '9500.00',
        },
      ],
    });

    await createService(submitted).apply({
      type: OrderEventType.WORK_CONFIRMED,
      orderId: ORDER_ID,
    });

    expect(submitted.tx.order.update.mock.calls[0]![0].data).toMatchObject({
      clientCompletionComment: null,
    });
  });

  it('запрещённый переход не доходит до записи', async () => {
    const completed = createPrismaStub({
      order: orderRow(OrderStatus.COMPLETED),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.COMPLETED,
          proposedPrice: '9500.00',
        },
      ],
    });

    await expect(
      createService(completed).apply({
        type: OrderEventType.WORK_CONFIRMED,
        orderId: ORDER_ID,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(completed.tx.order.update).not.toHaveBeenCalled();
    expect(completed.tx.offer.updateMany).not.toHaveBeenCalled();
    expect(completed.tx.notification.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('неподходящий статус предложения не доходит до записи', async () => {
    const rejected = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_CONFIRMATION),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.REJECTED,
          proposedPrice: '9500.00',
        },
        {
          id: OFFER_B,
          companyId: COMPANY_B,
          status: OfferStatus.SENT,
          proposedPrice: '11000.00',
        },
      ],
    });

    await expect(
      createService(rejected).apply({
        type: OrderEventType.OFFER_REJECTED,
        orderId: ORDER_ID,
        offerId: OFFER_A,
      }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'InvalidOfferStatus' } });

    expect(rejected.tx.order.update).not.toHaveBeenCalled();
  });

  it('отзыв предложения уведомляет клиента, а не компанию', async () => {
    // Заказ возвращается в поиск исполнителя чужими руками — клиент обязан
    // об этом узнать (ТЗ §8, находка R1-С1).
    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_WITHDRAWN,
      orderId: ORDER_ID,
      offerId: OFFER_A,
    });

    expect(applied.notifications).toHaveLength(1);
    expect(applied.notifications[0]).toMatchObject({
      userId: CLIENT_ID,
      type: NotificationType.OFFER_WITHDRAWN,
      orderId: ORDER_ID,
    });
  });
});

/**
 * Отправка предложения по ТЗ §4.1 — upsert: к моменту перехода строка уже
 * переписана в `SENT`. Читай сервис статус из базы, предусловие всегда видело
 * бы `SENT` и молча перестало бы что-либо проверять (находка R1-С2).
 */
describe('OrderTransitionService: статус предложения до записи', () => {
  it('берёт статус из команды, а не из уже переписанной строки', async () => {
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.AWAITING_CONFIRMATION),
      // В базе — то, что записал вызывающий код: предложение уже в `SENT`.
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.SENT,
          proposedPrice: '9500.00',
        },
      ],
    });

    await expect(
      createService(prisma).apply({
        type: OrderEventType.OFFER_SUBMITTED,
        orderId: ORDER_ID,
        offerId: OFFER_A,
        // А до записи компания работала по заказу — присылать предложение нельзя.
        offerStatusBefore: OfferStatus.ACCEPTED,
      }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'InvalidOfferStatus' } });

    expect(prisma.tx.order.update).not.toHaveBeenCalled();
  });

  it('у нового предложения статуса нет — переход проходит', async () => {
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.WAITING),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.SENT,
          proposedPrice: '9500.00',
          companyName: 'ООО «Стройград»',
        },
      ],
    });

    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
      offerStatusBefore: null,
    });

    expect(applied.nextStatus).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(applied.notifications[0]).toMatchObject({
      userId: CLIENT_ID,
      type: NotificationType.OFFER_RECEIVED,
    });
  });

  it('повторная отправка после отказа клиента проходит', async () => {
    const prisma = createPrismaStub({
      order: orderRow(OrderStatus.WAITING),
      offers: [
        {
          id: OFFER_A,
          companyId: COMPANY_A,
          status: OfferStatus.SENT,
          proposedPrice: '9500.00',
        },
      ],
    });

    const applied = await createService(prisma).apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: ORDER_ID,
      offerId: OFFER_A,
      offerStatusBefore: OfferStatus.REJECTED,
    });

    expect(applied.offerUpdates).toEqual([
      { offerId: OFFER_A, companyId: COMPANY_A, status: OfferStatus.SENT },
    ]);
  });
});
