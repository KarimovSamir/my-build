import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
} from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * Предложения компаний на живой базе (DoD подфазы 4.1): лента доступных
 * заказов, отправка и обновление предложения, отзыв и отклонение.
 *
 * Переходы статусов сами по себе покрыты `order-transition.e2e-spec.ts`
 * и unit-тестами машины. Здесь проверяется другое: что до них доходит
 * настоящий HTTP-запрос, что права разведены по ролям и что заказ,
 * с которого предложение отозвали, возвращается в ленту.
 */

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('offers');

/** Дата в будущем — допустимый срок выполнения. */
function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Предложения (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let client: E2eUser;
  let alpha: E2eUser;
  let beta: E2eUser;

  let clientToken: string;
  let alphaToken: string;
  let betaToken: string;

  const orderIds: string[] = [];

  async function seedOrder(title: string, status: OrderStatus = OrderStatus.WAITING) {
    const order = await prisma.order.create({
      data: {
        clientId: client.id,
        title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Описание работ для проверки предложений',
        address: 'Москва, ул. Тестовая, 1',
        squareMeters: 60,
        clientBudget: '90000.00',
        status,
      },
    });

    orderIds.push(order.id);
    return order;
  }

  /** Отправить предложение от имени компании. */
  function postOffer(
    token: string,
    orderId: string,
    body: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        proposedPrice: '85000.00',
        proposedDeadline: inDays(60),
        comment: 'Возьмёмся',
        ...body,
      });
  }

  /**
   * Лента доступных заказов, суженная до одного заказа поиском по номеру.
   *
   * Лента глобальная: в ней лежат заказы всех клиентов базы, включая seed
   * и соседние наборы e2e. Без сужения тест зависел бы от того, сколько
   * заказов в базе накопилось, — то есть падал бы через раз.
   */
  async function availableIds(token: string, orderNumber: number): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/company/orders/available')
      .query({ q: String(orderNumber), pageSize: 100 })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body.items.map((item: { id: string }) => item.id);
  }

  function orderStatus(orderId: string) {
    return prisma.order
      .findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
      .then((order) => order.status);
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, alpha, beta] = await Promise.all([
      users.createUser('offers-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('offers-alpha', {
        role: Role.COMPANY,
        companyName: 'ООО «Альфастрой»',
      }),
      users.createUser('offers-beta', {
        role: Role.COMPANY,
        companyName: 'ООО «Бетаремонт»',
      }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [clientToken, alphaToken, betaToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(alpha),
      signInE2eUser(beta),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await users.dropUsers();
  });

  describe('POST /offers', () => {
    it('переводит заказ в ожидание подтверждения и уведомляет клиента', async () => {
      const order = await seedOrder('Ремонт под ключ');

      const response = await postOffer(alphaToken, order.id);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        orderId: order.id,
        companyId: alpha.id,
        companyName: 'ООО «Альфастрой»',
        status: OfferStatus.SENT,
        proposedPrice: '85000',
        comment: 'Возьмёмся',
      });

      expect(await orderStatus(order.id)).toBe(OrderStatus.AWAITING_CONFIRMATION);

      const notifications = await prisma.notification.findMany({
        where: { orderId: order.id },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        userId: client.id,
        type: NotificationType.OFFER_RECEIVED,
      });
    });

    it('повторная отправка обновляет предложение, а не создаёт второе', async () => {
      const order = await seedOrder('Проект дома');

      const first = await postOffer(alphaToken, order.id);
      const second = await postOffer(alphaToken, order.id, {
        proposedPrice: '99000.00',
        comment: 'Пересчитали смету',
      });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body).toMatchObject({
        proposedPrice: '99000',
        comment: 'Пересчитали смету',
        status: OfferStatus.SENT,
      });

      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('принимает предложения от разных компаний на один заказ', async () => {
      const order = await seedOrder('Кровля склада');

      expect((await postOffer(alphaToken, order.id)).status).toBe(201);
      expect((await postOffer(betaToken, order.id)).status).toBe(201);

      // Второе предложение — норма, а не конфликт: заказ остаётся в том же
      // статусе и ждёт выбора клиента (ТЗ §4.1).
      expect(await orderStatus(order.id)).toBe(OrderStatus.AWAITING_CONFIRMATION);
      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(2);
    });

    it('отклоняет цену ноль и срок в прошлом', async () => {
      const order = await seedOrder('Заказ для проверки формы');

      const zeroPrice = await postOffer(alphaToken, order.id, { proposedPrice: '0' });
      expect(zeroPrice.status).toBe(400);
      expect(String(zeroPrice.body.message)).toContain('больше нуля');

      const pastDeadline = await postOffer(alphaToken, order.id, {
        proposedDeadline: inDays(-1),
      });
      expect(pastDeadline.status).toBe(400);

      // Ни одна отбитая попытка не должна оставить строку в базе.
      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(0);
      expect(await orderStatus(order.id)).toBe(OrderStatus.WAITING);
    });

    it('на несуществующий заказ отвечает 404', async () => {
      const response = await postOffer(
        alphaToken,
        '11111111-1111-4111-8111-111111111111',
      );

      expect(response.status).toBe(404);
    });

    it('на заказ в работе отвечает 409 и ничего не записывает', async () => {
      const order = await seedOrder('Заказ в работе', OrderStatus.IN_PROGRESS);

      const response = await postOffer(alphaToken, order.id);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('InvalidStateTransition');
      // Предложение пишется до перехода, и откат транзакции — единственное,
      // что не даёт ему остаться в базе.
      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(0);
    });

    it('клиенту отправлять предложения нельзя', async () => {
      const order = await seedOrder('Заказ клиента');

      const response = await postOffer(clientToken, order.id);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /company/orders/available', () => {
    it('показывает заказ до предложения, прячет после и возвращает после отзыва', async () => {
      const order = await seedOrder('Отделка офиса на Пресне');

      expect(await availableIds(alphaToken, order.orderNumber)).toContain(order.id);

      const offer = await postOffer(alphaToken, order.id);
      expect(await availableIds(alphaToken, order.orderNumber)).not.toContain(order.id);
      // Заказ с чужим предложением для другой компании остаётся доступным.
      expect(await availableIds(betaToken, order.orderNumber)).toContain(order.id);

      const withdrawn = await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${alphaToken}`);

      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body.status).toBe(OfferStatus.WITHDRAWN);
      expect(await availableIds(alphaToken, order.orderNumber)).toContain(order.id);

      // И новое предложение по тому же заказу отправляется как обычно.
      expect((await postOffer(alphaToken, order.id)).status).toBe(201);
    });

    it('ищет по названию и по номеру заказа', async () => {
      const order = await seedOrder('Реставрация фасада на Мойке');

      const found = async (q: string) => {
        const response = await request(app.getHttpServer())
          .get('/company/orders/available')
          .query({ q, pageSize: 100 })
          .set('Authorization', `Bearer ${betaToken}`);

        return response.body.items.map((item: { id: string }) => item.id);
      };

      expect(await found('фасада на Мойке')).toContain(order.id);
      expect(await found(String(order.orderNumber))).toContain(order.id);
      expect(await found(`ORD-${order.orderNumber}`)).toContain(order.id);
      expect(await found('такого заказа нет')).not.toContain(order.id);
    });

    it('не показывает заказы, которые уже не ищут исполнителя', async () => {
      const inProgress = await seedOrder('Монтаж вентиляции', OrderStatus.IN_PROGRESS);
      const completed = await seedOrder('Завершённый заказ', OrderStatus.COMPLETED);

      expect(await availableIds(betaToken, inProgress.orderNumber)).toHaveLength(0);
      expect(await availableIds(betaToken, completed.orderNumber)).toHaveLength(0);
    });

    it('прогресс чужого заказа компании не виден: статус показан как WAITING', async () => {
      const order = await seedOrder('Заказ с чужим предложением');
      await postOffer(alphaToken, order.id);

      const response = await request(app.getHttpServer())
        .get('/company/orders/available')
        .query({ q: String(order.orderNumber), pageSize: 100 })
        .set('Authorization', `Bearer ${betaToken}`);

      const item = response.body.items.find(
        (row: { id: string }) => row.id === order.id,
      );

      // В базе заказ уже в AWAITING_CONFIRMATION (ТЗ §4.1, приватность).
      expect(await orderStatus(order.id)).toBe(OrderStatus.AWAITING_CONFIRMATION);
      expect(item).toMatchObject({
        status: OrderStatus.WAITING,
        clientBudget: '90000',
        contractorName: null,
      });
    });

    it('клиенту лента компаний закрыта', async () => {
      const response = await request(app.getHttpServer())
        .get('/company/orders/available')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /company/offers', () => {
    it('отдаёт свои предложения вместе с заказом и фильтрует по статусу', async () => {
      const order = await seedOrder('Замена кровли на Ленина');
      const offer = await postOffer(betaToken, order.id);

      const all = await request(app.getHttpServer())
        .get('/company/offers')
        .query({ pageSize: 100 })
        .set('Authorization', `Bearer ${betaToken}`);

      expect(all.status).toBe(200);
      const own = all.body.items.find((item: { id: string }) => item.id === offer.body.id);
      expect(own).toMatchObject({
        status: OfferStatus.SENT,
        order: { id: order.id, title: 'Замена кровли на Ленина' },
      });

      const rejected = await request(app.getHttpServer())
        .get('/company/offers')
        .query({ status: OfferStatus.REJECTED, pageSize: 100 })
        .set('Authorization', `Bearer ${betaToken}`);

      expect(
        rejected.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(offer.body.id);
    });

    it('чужих предложений в списке нет', async () => {
      const order = await seedOrder('Заказ для проверки приватности списка');
      const alphaOffer = await postOffer(alphaToken, order.id);

      const response = await request(app.getHttpServer())
        .get('/company/offers')
        .query({ pageSize: 100 })
        .set('Authorization', `Bearer ${betaToken}`);

      expect(
        response.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(alphaOffer.body.id);
    });

    it('отклоняет неизвестный статус предложения', async () => {
      const response = await request(app.getHttpServer())
        .get('/company/offers')
        .query({ status: 'НЕИЗВЕСТНО' })
        .set('Authorization', `Bearer ${betaToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /offers/:id/withdraw', () => {
    it('возвращает заказ в поиск исполнителя, только если активных не осталось', async () => {
      const order = await seedOrder('Заказ с двумя предложениями');
      const alphaOffer = await postOffer(alphaToken, order.id);
      const betaOffer = await postOffer(betaToken, order.id);

      const first = await request(app.getHttpServer())
        .post(`/offers/${alphaOffer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${alphaToken}`);

      expect(first.status).toBe(200);
      // Второе предложение ещё в игре — заказу возвращаться некуда.
      expect(await orderStatus(order.id)).toBe(OrderStatus.AWAITING_CONFIRMATION);

      const second = await request(app.getHttpServer())
        .post(`/offers/${betaOffer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${betaToken}`);

      expect(second.status).toBe(200);
      expect(await orderStatus(order.id)).toBe(OrderStatus.WAITING);
    });

    it('уведомляет клиента и не даёт отозвать предложение дважды', async () => {
      const order = await seedOrder('Заказ с отзывом');
      const offer = await postOffer(alphaToken, order.id);

      await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const notification = await prisma.notification.findFirst({
        where: { orderId: order.id, type: NotificationType.OFFER_WITHDRAWN },
      });
      expect(notification?.userId).toBe(client.id);

      const again = await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${alphaToken}`);

      expect(again.status).toBe(409);
      expect(again.body.error).toBe('InvalidStateTransition');
    });

    it('чужое предложение — «не найдено», клиенту маршрут закрыт', async () => {
      const order = await seedOrder('Заказ для проверки прав отзыва');
      const offer = await postOffer(alphaToken, order.id);

      await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${betaToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/offers/not-a-uuid/withdraw')
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);

      // Ни одна отбитая попытка не тронула предложение.
      const untouched = await prisma.offer.findUniqueOrThrow({
        where: { id: offer.body.id },
      });
      expect(untouched.status).toBe(OfferStatus.SENT);
    });
  });

  describe('POST /offers/:id/reject', () => {
    it('клиент отклоняет предложение и заказ возвращается в поиск исполнителя', async () => {
      const order = await seedOrder('Заказ с отклонением');
      const offer = await postOffer(alphaToken, order.id);

      const response = await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/reject`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(OfferStatus.REJECTED);
      expect(await orderStatus(order.id)).toBe(OrderStatus.WAITING);

      const notification = await prisma.notification.findFirst({
        where: { orderId: order.id, type: NotificationType.OFFER_REJECTED },
      });
      expect(notification?.userId).toBe(alpha.id);

      // Отклонённое предложение возвращает заказ в ленту этой же компании.
      expect(await availableIds(alphaToken, order.orderNumber)).toContain(order.id);
    });

    it('предложение по чужому заказу клиент отклонить не может', async () => {
      const stranger = await users.createUser('offers-stranger', {
        role: Role.CLIENT,
        firstName: 'Виктор',
      });
      const strangerToken = await signInE2eUser(stranger);

      const order = await seedOrder('Заказ для проверки прав отклонения');
      const offer = await postOffer(alphaToken, order.id);

      await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/reject`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);

      // Компании отклонять предложения нельзя — это действие клиента.
      await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/reject`)
        .set('Authorization', `Bearer ${betaToken}`)
        .expect(403);
    });
  });

  describe('Приватность предложений на карточке заказа', () => {
    it('компания видит только своё предложение, клиент — все активные', async () => {
      const order = await seedOrder('Заказ с двумя предложениями на карточке');
      const alphaOffer = await postOffer(alphaToken, order.id);
      await postOffer(betaToken, order.id);

      const forCompany = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${alphaToken}`);

      expect(forCompany.status).toBe(200);
      expect(forCompany.body.offers).toHaveLength(1);
      expect(forCompany.body.offers[0].id).toBe(alphaOffer.body.id);

      const forClient = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(forClient.body.offers).toHaveLength(2);
    });
  });
});
