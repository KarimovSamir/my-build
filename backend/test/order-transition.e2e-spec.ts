import 'dotenv/config';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { OfferStatus, OrderStatus } from '@mybuild/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  NotificationType,
  ObjectType,
  OrderCategory,
  Role,
} from '../src/generated/prisma/client.js';
import { OrdersModule } from '../src/modules/orders/orders.module.js';
import { OrderEventType } from '../src/modules/orders/order-state-machine.js';
import { OrderTransitionService } from '../src/modules/orders/order-transition.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createE2eUser, dropE2eUsers } from './support/e2e-users.js';

/**
 * Проверяет обёртку state-машины на настоящей базе: что переход не только
 * посчитан, но и записан — статусы, цена сделки, комментарии и уведомления.
 *
 * Логика самих переходов покрыта unit-тестами без базы
 * (`src/modules/orders/order-state-machine.spec.ts`). Здесь важна запись.
 *
 * Тест работает с реальным подключением из backend/.env и заводит своих
 * пользователей через Supabase Auth, а в конце удаляет их — каскад уносит
 * профили, заказы, предложения и уведомления.
 */
describe('OrderTransitionService (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let transitions: OrderTransitionService;

  let clientId: string;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        PrismaModule,
        OrdersModule,
      ],
    }).compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    transitions = moduleRef.get(OrderTransitionService);

    // Следы прерванных прогонов: тест, упавший по таймауту, до afterAll
    // не доходит и оставляет своих пользователей в базе.
    await dropE2eUsers();

    clientId = (await createE2eUser('client', { role: Role.CLIENT })).id;
    companyAId = (
      await createE2eUser('company-a', {
        role: Role.COMPANY,
        companyName: 'ООО «Тест А»',
      })
    ).id;
    companyBId = (
      await createE2eUser('company-b', {
        role: Role.COMPANY,
        companyName: 'ООО «Тест Б»',
      })
    ).id;
  });

  afterAll(async () => {
    await dropE2eUsers();
    await moduleRef?.close();
  });

  /** Заказ в поиске исполнителя с предложениями от обеих компаний. */
  async function createOrderWithOffers(deadline: Date) {
    const order = await prisma.order.create({
      data: {
        clientId,
        title: 'Тестовый заказ',
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Заказ для проверки переходов',
        address: 'Москва, ул. Тестовая, 1',
        squareMeters: 50,
        clientBudget: '10000.00',
        offers: {
          create: [
            {
              companyId: companyAId,
              proposedPrice: '9500.00',
              proposedDeadline: deadline,
            },
            {
              companyId: companyBId,
              proposedPrice: '11000.00',
              proposedDeadline: deadline,
            },
          ],
        },
      },
      include: { offers: { orderBy: { proposedPrice: 'asc' } } },
    });

    const [offerA, offerB] = order.offers;
    return { order, offerA: offerA!, offerB: offerB! };
  }

  it('проводит заказ через полный цикл и записывает результат в базу', async () => {
    const deadline = new Date('2027-03-01T00:00:00.000Z');
    const { order, offerA, offerB } = await createOrderWithOffers(deadline);

    const submitted = await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    expect(submitted.order.status).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(submitted.notifications).toHaveLength(1);
    expect(submitted.notifications[0]).toMatchObject({
      userId: clientId,
      type: NotificationType.OFFER_RECEIVED,
      isRead: false,
    });

    const accepted = await transitions.apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    expect(accepted.order.status).toBe(OrderStatus.IN_PROGRESS);
    expect(accepted.order.price?.toString()).toBe('9500');
    expect(accepted.order.deadline?.toISOString()).toBe(deadline.toISOString());
    expect(accepted.notifications[0]).toMatchObject({
      userId: companyAId,
      type: NotificationType.OFFER_ACCEPTED,
    });

    // Проигравшая компания узнаёт о решении клиента тем же коммитом (ТЗ §8),
    // а Фаза 5 берёт из `offerUpdates` адресатов `offer:status_changed`.
    expect(accepted.notifications[1]).toMatchObject({
      userId: companyBId,
      type: NotificationType.OFFER_REJECTED,
    });
    expect(accepted.offerUpdates).toEqual([
      { offerId: offerA.id, companyId: companyAId, status: OfferStatus.ACCEPTED },
      { offerId: offerB.id, companyId: companyBId, status: OfferStatus.NOT_ACCEPTED },
    ]);

    const offersAfterAccept = await prisma.offer.findMany({
      where: { orderId: order.id },
      select: { id: true, status: true },
    });
    expect(new Map(offersAfterAccept.map((o) => [o.id, o.status]))).toEqual(
      new Map([
        [offerA.id, OfferStatus.ACCEPTED],
        [offerB.id, OfferStatus.NOT_ACCEPTED],
      ]),
    );

    // Предложение исполнителя сервис находит сам — передавать его не нужно.
    const workSubmitted = await transitions.apply({
      type: OrderEventType.WORK_SUBMITTED,
      orderId: order.id,
    });
    expect(workSubmitted.order.status).toBe(
      OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    );
    expect(workSubmitted.offerId).toBe(offerA.id);

    const disputed = await transitions.apply({
      type: OrderEventType.WORK_DISPUTED,
      orderId: order.id,
      correctionComment: 'Переделать швы',
    });
    expect(disputed.order.status).toBe(OrderStatus.COMPLETION_DISPUTED);
    expect(disputed.order.correctionComment).toBe('Переделать швы');
    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerA.id } })).status,
    ).toBe(OfferStatus.BACK_FOR_OVERRIDE);

    const resubmitted = await transitions.apply({
      type: OrderEventType.WORK_SUBMITTED,
      orderId: order.id,
    });
    expect(resubmitted.order.status).toBe(
      OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    );

    const completed = await transitions.apply({
      type: OrderEventType.WORK_CONFIRMED,
      orderId: order.id,
      completionComment: 'Принято',
    });
    expect(completed.order.status).toBe(OrderStatus.COMPLETED);
    expect(completed.order.clientCompletionComment).toBe('Принято');
    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerA.id } })).status,
    ).toBe(OfferStatus.COMPLETED);
  });

  it('отклоняет повторную приёмку завершённого заказа с 409 и ничего не меняет', async () => {
    const { order, offerA } = await createOrderWithOffers(
      new Date('2027-04-01T00:00:00.000Z'),
    );

    await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    await transitions.apply({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    await transitions.apply({ type: OrderEventType.WORK_SUBMITTED, orderId: order.id });
    await transitions.apply({ type: OrderEventType.WORK_CONFIRMED, orderId: order.id });

    const notificationsBefore = await prisma.notification.count({
      where: { orderId: order.id },
    });

    await expect(
      transitions.apply({ type: OrderEventType.WORK_CONFIRMED, orderId: order.id }),
    ).rejects.toMatchObject({ status: 409 });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(OrderStatus.COMPLETED);
    expect(await prisma.notification.count({ where: { orderId: order.id } })).toBe(
      notificationsBefore,
    );
  });

  it('отклоняет предложение один раз: повторное отклонение даёт 409', async () => {
    const { order, offerA, offerB } = await createOrderWithOffers(
      new Date('2027-06-01T00:00:00.000Z'),
    );

    await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerB.id,
    });

    const rejected = await transitions.apply({
      type: OrderEventType.OFFER_REJECTED,
      orderId: order.id,
      offerId: offerB.id,
    });
    expect(rejected.order.status).toBe(OrderStatus.AWAITING_CONFIRMATION);
    expect(rejected.notifications[0]).toMatchObject({
      userId: companyBId,
      type: NotificationType.OFFER_REJECTED,
    });

    const notificationsBefore = await prisma.notification.count({
      where: { orderId: order.id },
    });

    // Заказ по-прежнему ждёт выбора из предложения компании А, то есть
    // по статусу заказа переход разрешён. Второй раз отклонять уже нечего.
    await expect(
      transitions.apply({
        type: OrderEventType.OFFER_REJECTED,
        orderId: order.id,
        offerId: offerB.id,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(await prisma.notification.count({ where: { orderId: order.id } })).toBe(
      notificationsBefore,
    );
  });

  it('не находит заказ по идентификатору, который не является UUID', async () => {
    await expect(
      transitions.apply({ type: OrderEventType.WORK_SUBMITTED, orderId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('возвращает заказ в поиск исполнителя, когда отозвано последнее предложение', async () => {
    const { order, offerA, offerB } = await createOrderWithOffers(
      new Date('2027-05-01T00:00:00.000Z'),
    );

    await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerA.id,
    });
    await transitions.apply({
      type: OrderEventType.OFFER_SUBMITTED,
      orderId: order.id,
      offerId: offerB.id,
    });

    const firstWithdraw = await transitions.apply({
      type: OrderEventType.OFFER_WITHDRAWN,
      orderId: order.id,
      offerId: offerB.id,
    });
    expect(firstWithdraw.order.status).toBe(OrderStatus.AWAITING_CONFIRMATION);

    const lastWithdraw = await transitions.apply({
      type: OrderEventType.OFFER_WITHDRAWN,
      orderId: order.id,
      offerId: offerA.id,
    });
    expect(lastWithdraw.order.status).toBe(OrderStatus.WAITING);
    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerA.id } })).status,
    ).toBe(OfferStatus.WITHDRAWN);
  });
});
