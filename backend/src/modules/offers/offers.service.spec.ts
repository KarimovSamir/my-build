import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OfferStatus } from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OrderEventType } from '../orders/order-state-machine.js';
import type {
  OrderTransitionCommand,
  OrderTransitionService,
} from '../orders/order-transition.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { OffersService } from './offers.service.js';

/**
 * Сервис предложений без базы: порядок обращений и то, что уходит в переход.
 *
 * Проверяется здесь, потому что на живой базе этого не видно: и правильный,
 * и неправильный порядок дают один и тот же ответ, а расходятся они только
 * под нагрузкой — при гонке или взаимной блокировке (`CLAUDE.md` §10,
 * «Что учесть в Фазе 4»).
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OFFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

const DEADLINE = '2027-03-01';

function offerRow(status: OfferStatus = OfferStatus.SENT) {
  return {
    id: OFFER_ID,
    orderId: ORDER_ID,
    companyId: COMPANY_ID,
    status,
    proposedPrice: new Prisma.Decimal('150000.50'),
    proposedDeadline: new Date(`${DEADLINE}T00:00:00.000Z`),
    comment: 'Возьмёмся',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    company: { companyName: 'ООО «Строймир»' },
  };
}

/** Что и в каком порядке сервис сделал внутри транзакции. */
type Trace = string[];

function createStubs(options: { existing?: OfferStatus | null } = {}) {
  const trace: Trace = [];

  const tx = {
    offer: {
      findUnique: vi.fn(async () => {
        trace.push('read-status');
        return options.existing ? { status: options.existing } : null;
      }),
      upsert: vi.fn(async () => {
        trace.push('upsert');
        return offerRow();
      }),
    },
  };

  // Параметры перечислены явно, даже неиспользуемые: без них `mock.calls`
  // получает тип `[]`, и обращение к аргументу перестаёт компилироваться
  // (`CLAUDE.md` §10, «Тесты»).
  const prisma = {
    $transaction: vi.fn(
      async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    ),
    offer: {
      findUnique: vi.fn(async (_args: unknown) => offerRow(OfferStatus.WITHDRAWN)),
      findFirst: vi.fn(async (_args: { where: Prisma.OfferWhereInput }) => ({
        id: OFFER_ID,
        orderId: ORDER_ID,
      })),
    },
  };

  const transitions = {
    lockOrder: vi.fn(async (_tx: unknown, _orderId: string) => {
      trace.push('lock-order');
      return { id: ORDER_ID };
    }),
    apply: vi.fn(async (_command: OrderTransitionCommand, _tx?: unknown) => {
      trace.push('apply');
      return {};
    }),
  };

  // Рассылка подменяется целиком: адресация комнат проверяется своим набором
  // (`realtime-events.spec.ts`), здесь важно только то, что её вызвали.
  const realtime = {
    transitionApplied: vi.fn((_applied: unknown, _offerExisted?: boolean) => undefined),
  };

  const service = new OffersService(
    prisma as unknown as PrismaService,
    transitions as unknown as OrderTransitionService,
    realtime as unknown as RealtimeService,
  );

  return { service, prisma, transitions, realtime, trace };
}

describe('OffersService.submit', () => {
  it('блокирует заказ до записи предложения и переходит после неё', async () => {
    const { service, trace } = createStubs();

    await service.submit(COMPANY_ID, {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
    });

    // Заказ первым: переход берёт те же строки в этом порядке, и обратный
    // порядок здесь дал бы взаимную блокировку с принятием чужого предложения.
    expect(trace).toEqual(['lock-order', 'read-status', 'upsert', 'apply']);
  });

  it('переход идёт той же транзакцией, что и запись предложения', async () => {
    const { service, prisma, transitions } = createStubs();

    await service.submit(COMPANY_ID, {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Второй аргумент — клиент транзакции: без него переход открыл бы свою,
    // и предложение осталось бы в SENT на заказе, который никуда не перешёл.
    expect(transitions.apply.mock.calls[0]![1]).toBeDefined();
  });

  it('передаёт машине статус предложения до записи, а не после', async () => {
    const { service, transitions } = createStubs({ existing: OfferStatus.WITHDRAWN });

    await service.submit(COMPANY_ID, {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
    });

    expect(transitions.apply.mock.calls[0]![0]).toMatchObject({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: ORDER_ID,
      offerId: OFFER_ID,
      offerStatusBefore: OfferStatus.WITHDRAWN,
    });
  });

  it('у первого предложения статуса «до» нет', async () => {
    const { service, transitions } = createStubs({ existing: null });

    await service.submit(COMPANY_ID, {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
    });

    expect(transitions.apply.mock.calls[0]![0]).toMatchObject({
      offerStatusBefore: null,
    });
  });

  it('различает `offer:created` и `offer:updated` по строке до запроса', async () => {
    // Отправка предложения — upsert (ТЗ §4.1), и после записи в базе всегда
    // `SENT`: было предложение или нет, знает только вызывающий код.
    const first = createStubs({ existing: null });
    const again = createStubs({ existing: OfferStatus.WITHDRAWN });

    const dto = {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
    };

    await first.service.submit(COMPANY_ID, dto);
    await again.service.submit(COMPANY_ID, dto);

    expect(first.realtime.transitionApplied.mock.calls[0]![1]).toBe(false);
    expect(again.realtime.transitionApplied.mock.calls[0]![1]).toBe(true);
  });

  it('не рассылает событий, если переход не состоялся', async () => {
    // Рассылка идёт после коммита именно поэтому: отправь мы событие изнутри
    // транзакции — клиент пошёл бы искать предложение, которого нет.
    const { service, transitions, realtime } = createStubs();
    transitions.apply.mockRejectedValueOnce(new Error('переход невозможен'));

    await expect(
      service.submit(COMPANY_ID, {
        orderId: ORDER_ID,
        proposedPrice: '150000.50',
        proposedDeadline: DEADLINE,
      }),
    ).rejects.toThrow('переход невозможен');

    expect(realtime.transitionApplied).not.toHaveBeenCalled();
  });

  it('отдаёт предложение в виде контракта API: суммы и даты строками', async () => {
    const { service } = createStubs();

    const offer = await service.submit(COMPANY_ID, {
      orderId: ORDER_ID,
      proposedPrice: '150000.50',
      proposedDeadline: DEADLINE,
      comment: 'Возьмёмся',
    });

    expect(offer).toMatchObject({
      id: OFFER_ID,
      companyName: 'ООО «Строймир»',
      status: OfferStatus.SENT,
      proposedPrice: '150000.5',
      proposedDeadline: '2027-03-01T00:00:00.000Z',
    });
  });
});

describe('OffersService.withdraw / reject', () => {
  it('компания ищет своё предложение, клиент — предложение по своему заказу', async () => {
    const { service, prisma } = createStubs();

    await service.withdraw(COMPANY_ID, OFFER_ID);
    expect(prisma.offer.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: OFFER_ID, companyId: COMPANY_ID },
    });

    await service.reject(CLIENT_ID, OFFER_ID);
    expect(prisma.offer.findFirst.mock.calls[1]![0]).toMatchObject({
      where: { id: OFFER_ID, order: { clientId: CLIENT_ID } },
    });
  });

  it('возвращает предложение перечитанным после перехода', async () => {
    const { service, prisma } = createStubs();

    const offer = await service.withdraw(COMPANY_ID, OFFER_ID);

    // Статус и `updatedAt` меняет переход, поэтому строка читается заново,
    // а не собирается из старой с подставленным статусом.
    expect(prisma.offer.findUnique).toHaveBeenCalled();
    expect(offer.status).toBe(OfferStatus.WITHDRAWN);
  });

  it('на мусорный идентификатор отвечает 404, не дойдя до базы', async () => {
    const { service, prisma } = createStubs();

    await expect(service.withdraw(COMPANY_ID, 'не-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.offer.findFirst).not.toHaveBeenCalled();
  });

  it('чужое предложение — «не найдено», а не «нет прав»', async () => {
    const { service, prisma, transitions } = createStubs();
    prisma.offer.findFirst.mockResolvedValueOnce(null as never);

    await expect(service.withdraw(COMPANY_ID, OFFER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transitions.apply).not.toHaveBeenCalled();
  });
});

describe('OffersService.listOwnOffers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('фильтр по статусу попадает в запрос, а его отсутствие — нет', async () => {
    const rows = [{ ...offerRow(), order: orderRowForList() }];

    const prisma = {
      offer: {
        count: vi.fn(async (_args: unknown) => 1),
        findMany: vi.fn(async (_args: { where: Prisma.OfferWhereInput }) => rows),
      },
    };

    const service = new OffersService(
      prisma as unknown as PrismaService,
      {} as OrderTransitionService,
      {} as RealtimeService,
    );

    await service.listOwnOffers(COMPANY_ID, { page: 1, pageSize: 20 });
    expect(prisma.offer.findMany.mock.calls[0]![0]).toMatchObject({
      where: { companyId: COMPANY_ID },
    });
    expect(prisma.offer.findMany.mock.calls[0]![0].where.status).toBeUndefined();

    await service.listOwnOffers(COMPANY_ID, {
      page: 1,
      pageSize: 20,
      status: OfferStatus.SENT,
    });
    expect(prisma.offer.findMany.mock.calls[1]![0]).toMatchObject({
      where: { companyId: COMPANY_ID, status: OfferStatus.SENT },
    });
  });
});

/** Заказ в том объёме, в каком его читает список предложений компании. */
function orderRowForList() {
  return {
    id: ORDER_ID,
    orderNumber: 42,
    clientId: CLIENT_ID,
    title: 'Ремонт квартиры',
    status: 'AWAITING_CONFIRMATION' as const,
    category: 'PLAN_IMPLEMENTATION' as const,
    objectType: 'APARTMENT' as const,
    clientBudget: new Prisma.Decimal('90000.00'),
    price: null,
    deadline: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    offers: [offerRow()],
  };
}
