import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ObjectType, OfferStatus, OrderCategory, OrderStatus, Role } from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * Одновременные запросы к одному заказу на живой базе.
 *
 * Unit-тесты проверяют порядок блокировок и очередь заказа по отдельности,
 * но не то, что они вместе держат настоящий Postgres: ровно один победитель
 * выбора, ни одного 500 под наплывом и согласованное состояние после.
 * Эти сценарии раньше проверялись только разово, в нагрузочном аудите.
 */

const users = e2eSuite('concurrency');

/** Дата в будущем — допустимый срок выполнения. */
function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Одновременные запросы (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let client: E2eUser;
  let companies: E2eUser[];

  let clientToken: string;
  let companyTokens: string[];

  async function seedOrder(title: string) {
    return prisma.order.create({
      data: {
        clientId: client.id,
        title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Заказ для проверки одновременных запросов',
        address: 'Баку, ул. Тестовая, 3',
        squareMeters: 50,
        status: OrderStatus.WAITING,
      },
    });
  }

  function postOffer(token: string, orderId: string, price: string) {
    return request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, proposedPrice: price, proposedDeadline: inDays(45) });
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, ...companies] = await Promise.all([
      users.createUser('race-client', { role: Role.CLIENT, firstName: 'Лейла' }),
      users.createUser('race-a', { role: Role.COMPANY, companyName: 'ООО «Гонка А»' }),
      users.createUser('race-b', { role: Role.COMPANY, companyName: 'ООО «Гонка Б»' }),
      users.createUser('race-c', { role: Role.COMPANY, companyName: 'ООО «Гонка В»' }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [clientToken, ...companyTokens] = await Promise.all(
      [client, ...companies].map((user) => signInE2eUser(user)),
    );
  });

  afterAll(async () => {
    await app?.close();
    await users.dropUsers();
  });

  it('наплыв предложений на один заказ проходит без единого 500', async () => {
    // Каждая компания правит своё предложение несколько раз подряд — всё
    // разом. Раньше ждущие блокировку транзакции выбирали пул соединений,
    // и часть запросов падала 500 «Unable to start a transaction».
    const order = await seedOrder('Наплыв предложений');

    const responses = await Promise.all(
      companyTokens.flatMap((token, company) =>
        Array.from({ length: 4 }, (_, attempt) =>
          postOffer(token, order.id, `${50_000 + company * 1000 + attempt}.00`),
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      responses.map(() => 201),
    );

    const offers = await prisma.offer.findMany({ where: { orderId: order.id } });
    expect(offers).toHaveLength(companies.length);
    expect(offers.every((offer) => offer.status === OfferStatus.SENT)).toBe(true);

    const { status } = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(status).toBe(OrderStatus.AWAITING_CONFIRMATION);
  });

  it('одновременное принятие разных предложений и отзыв: победитель ровно один', async () => {
    const order = await seedOrder('Гонка выбора');

    const offers = await Promise.all(
      companyTokens.map(async (token, index) => {
        const response = await postOffer(token, order.id, `${60_000 + index * 1000}.00`);
        expect(response.status).toBe(201);
        return response.body as { id: string };
      }),
    );

    const [accepts, withdrawal] = await Promise.all([
      Promise.all(
        offers.slice(0, 2).map((offer) =>
          request(app.getHttpServer())
            .post(`/orders/${order.id}/accept-offer/${offer.id}`)
            .set('Authorization', `Bearer ${clientToken}`),
        ),
      ),
      request(app.getHttpServer())
        .post(`/offers/${offers[2]!.id}/withdraw`)
        .set('Authorization', `Bearer ${companyTokens[2]}`),
    ]);

    const statuses = accepts.map((response) => response.status).toSorted();
    expect(statuses).toEqual([200, 409]);
    // Отзыв либо успел до выбора, либо опоздал — но не упал.
    expect([200, 409]).toContain(withdrawal.status);

    const rows = await prisma.offer.findMany({ where: { orderId: order.id } });
    expect(rows.filter((row) => row.status === OfferStatus.ACCEPTED)).toHaveLength(1);
    expect(rows.filter((row) => row.status === OfferStatus.SENT)).toHaveLength(0);

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe(OrderStatus.IN_PROGRESS);
    // Цена сделки — ровно от того предложения, которое приняли.
    const winner = rows.find((row) => row.status === OfferStatus.ACCEPTED)!;
    expect(saved.price?.toString()).toBe(winner.proposedPrice.toString());
  });

  it('удаление заказа одновременно с новыми предложениями оставляет базу согласованной', async () => {
    const order = await seedOrder('Гонка удаления');

    const [removal, ...offers] = await Promise.all([
      request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`),
      ...companyTokens.map((token, index) =>
        postOffer(token, order.id, `${70_000 + index * 1000}.00`),
      ),
    ]);

    // Ни одного 500: каждый запрос либо успел, либо получил честный отказ.
    for (const response of [removal, ...offers]) {
      expect(response.status).toBeLessThan(500);
    }

    const left = await prisma.order.findUnique({ where: { id: order.id } });

    if (removal.status < 300) {
      // Заказ удалён — предложений без заказа не осталось.
      expect(left).toBeNull();
      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(0);
    } else {
      // Удаление опоздало: заказ жив, и его статус сходится с предложениями.
      expect(left?.status).toBe(OrderStatus.AWAITING_CONFIRMATION);
    }
  });
});
