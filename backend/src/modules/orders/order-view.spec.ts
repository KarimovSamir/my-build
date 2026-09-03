import { describe, expect, it } from 'vitest';

import {
  FileOwnerType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
} from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { toOrderDetail, toOrderListItem, type OfferRow, type OrderDetailRow } from './order-view.js';

/**
 * Приватность заказа (ТЗ §4.1) — самое дорогое место этого модуля: ошибка
 * здесь не падает, а тихо показывает компании чужие цены. Поэтому все правила
 * видимости проверяются на чистых функциях, без базы и без сети.
 */

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';
const EXECUTOR_ID = '33333333-3333-3333-3333-333333333333';
const RIVAL_ID = '44444444-4444-4444-4444-444444444444';
const OUTSIDER_ID = '55555555-5555-5555-5555-555555555555';

function offer(
  companyId: string,
  status: OfferStatus,
  overrides: Partial<OfferRow> = {},
): OfferRow {
  return {
    id: `offer-${companyId}`,
    orderId: ORDER_ID,
    companyId,
    status,
    proposedPrice: new Prisma.Decimal('5000.00'),
    proposedDeadline: new Date('2027-01-01T00:00:00.000Z'),
    comment: 'Сделаем за месяц',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    company: { companyName: `ООО «${companyId.slice(0, 4)}»` },
    ...overrides,
  };
}

function order(overrides: Partial<OrderDetailRow> = {}): OrderDetailRow {
  return {
    id: ORDER_ID,
    orderNumber: 7829,
    clientId: CLIENT_ID,
    title: 'Ремонт квартиры 100м²',
    status: OrderStatus.IN_PROGRESS,
    category: OrderCategory.PLAN_IMPLEMENTATION,
    objectType: ObjectType.APARTMENT,
    clientBudget: new Prisma.Decimal('120000.00'),
    price: new Prisma.Decimal('115000.00'),
    deadline: new Date('2027-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-09-02T09:00:00.000Z'),
    description: 'Полный ремонт под ключ',
    address: 'Москва, ул. Тестовая, 1',
    squareMeters: 100,
    verifiedSquareMeters: 98,
    desiredStartDate: new Date('2026-10-01T00:00:00.000Z'),
    clientCompletionComment: 'Всё принято',
    correctionComment: 'Переделать проводку',
    client: {
      id: CLIENT_ID,
      firstName: 'Анна',
      lastName: 'Тестова',
      city: 'Москва',
      country: 'Россия',
    },
    offers: [
      offer(EXECUTOR_ID, OfferStatus.ACCEPTED),
      offer(RIVAL_ID, OfferStatus.NOT_ACCEPTED),
    ],
    files: [
      {
        id: 'file-1',
        orderId: ORDER_ID,
        ownerType: FileOwnerType.CLIENT,
        submissionRound: 0,
        originalName: 'План.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdAt: '2026-09-01T09:05:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('toOrderDetail — клиент-владелец', () => {
  const view = toOrderDetail(order(), { id: CLIENT_ID });

  it('видит настоящий статус, цену сделки и срок', () => {
    expect(view.status).toBe(OrderStatus.IN_PROGRESS);
    expect(view.price).toBe('115000');
    expect(view.deadline).toBe('2027-03-01T00:00:00.000Z');
  });

  it('видит уточнённую площадь и оба комментария', () => {
    expect(view.verifiedSquareMeters).toBe(98);
    expect(view.correctionComment).toBe('Переделать проводку');
    expect(view.clientCompletionComment).toBe('Всё принято');
  });

  it('видит файлы и подрядчика', () => {
    expect(view.files).toHaveLength(1);
    expect(view.contractorName).toBe('ООО «3333»');
  });

  it('видит только предложения, которые ещё в игре', () => {
    expect(view.offers.map((item) => item.companyId)).toEqual([EXECUTOR_ID]);
  });

  it('суммы отдаются строками, а не числами', () => {
    expect(view.clientBudget).toBe('120000');
    expect(view.offers[0]!.proposedPrice).toBe('5000');
  });
});

describe('toOrderDetail — компания-исполнитель', () => {
  const view = toOrderDetail(order(), { id: EXECUTOR_ID });

  it('видит настоящий статус и условия сделки', () => {
    expect(view.status).toBe(OrderStatus.IN_PROGRESS);
    expect(view.price).toBe('115000');
    expect(view.verifiedSquareMeters).toBe(98);
    expect(view.correctionComment).toBe('Переделать проводку');
  });

  it('видит файлы заказа', () => {
    expect(view.files).toHaveLength(1);
  });

  it('видит только своё предложение, не конкурентов', () => {
    expect(view.offers.map((item) => item.companyId)).toEqual([EXECUTOR_ID]);
  });
});

describe('toOrderDetail — компания с активным предложением, но не выбранная', () => {
  const waiting = order({
    status: OrderStatus.AWAITING_CONFIRMATION,
    price: null,
    deadline: null,
    verifiedSquareMeters: null,
    correctionComment: null,
    clientCompletionComment: null,
    offers: [offer(EXECUTOR_ID, OfferStatus.SENT), offer(RIVAL_ID, OfferStatus.SENT)],
  });
  const view = toOrderDetail(waiting, { id: EXECUTOR_ID });

  it('видит настоящий статус: её предложение на рассмотрении', () => {
    expect(view.status).toBe(OrderStatus.AWAITING_CONFIRMATION);
  });

  it('файлов заказа не видит: исполнителем её ещё не выбрали', () => {
    expect(view.files).toEqual([]);
  });

  it('видит только своё предложение', () => {
    expect(view.offers.map((item) => item.companyId)).toEqual([EXECUTOR_ID]);
  });
});

describe('toOrderDetail — компания, которая в заказе не участвует', () => {
  it('видит заказ как WAITING, без цены, срока и подрядчика', () => {
    const view = toOrderDetail(order(), { id: OUTSIDER_ID });

    expect(view.status).toBe(OrderStatus.WAITING);
    expect(view.price).toBeNull();
    expect(view.deadline).toBeNull();
    expect(view.contractorName).toBeNull();
    expect(view.verifiedSquareMeters).toBeNull();
    expect(view.correctionComment).toBeNull();
    expect(view.clientCompletionComment).toBeNull();
    expect(view.files).toEqual([]);
    expect(view.offers).toEqual([]);
  });

  it('компания с невыбранным предложением тоже не видит прогресса', () => {
    const view = toOrderDetail(order(), { id: RIVAL_ID });

    expect(view.status).toBe(OrderStatus.WAITING);
    expect(view.price).toBeNull();
    expect(view.files).toEqual([]);
  });

  it('но своё выбывшее предложение по-прежнему видит', () => {
    const view = toOrderDetail(order(), { id: RIVAL_ID });

    expect(view.offers).toHaveLength(1);
    expect(view.offers[0]).toMatchObject({
      companyId: RIVAL_ID,
      status: OfferStatus.NOT_ACCEPTED,
    });
  });

  it('задание клиента остаётся видимым: по нему подают предложения', () => {
    const view = toOrderDetail(order(), { id: OUTSIDER_ID });

    expect(view.description).toBe('Полный ремонт под ключ');
    expect(view.address).toBe('Москва, ул. Тестовая, 1');
    expect(view.clientBudget).toBe('120000');
    expect(view.squareMeters).toBe(100);
  });
});

describe('toOrderListItem', () => {
  it('подставляет подрядчика владельцу заказа', () => {
    const item = toOrderListItem(order(), { id: CLIENT_ID });

    expect(item).toMatchObject({
      orderNumber: 7829,
      status: OrderStatus.IN_PROGRESS,
      contractorName: 'ООО «3333»',
      price: '115000',
    });
  });

  it('у заказа без исполнителя подрядчик пустой', () => {
    const item = toOrderListItem(order({ offers: [], price: null, deadline: null }), {
      id: CLIENT_ID,
    });

    expect(item.contractorName).toBeNull();
    expect(item.price).toBeNull();
  });

  it('посторонней компании отдаёт строку без прогресса', () => {
    const item = toOrderListItem(order(), { id: OUTSIDER_ID });

    expect(item.status).toBe(OrderStatus.WAITING);
    expect(item.contractorName).toBeNull();
    expect(item.deadline).toBeNull();
  });
});
