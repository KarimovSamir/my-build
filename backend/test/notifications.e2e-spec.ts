import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  NotificationType,
  ObjectType,
  OrderCategory,
  OrderStatus,
  Role,
  type NotificationDto,
} from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * Уведомления на живой базе (DoD подфазы 5.1).
 *
 * Что здесь проверяется помимо самих четырёх маршрутов: чужие уведомления
 * не видны и не помечаются, а уведомление об удалении заказа переживает сам
 * заказ — ради этого `Notification.orderId` переведён с каскада на `SetNull`.
 */

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('notifications');

/** Дата в будущем — допустимый срок выполнения. */
function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Уведомления (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let client: E2eUser;
  let company: E2eUser;

  let clientToken: string;
  let companyToken: string;

  function seedOrder(title: string) {
    return prisma.order.create({
      data: {
        clientId: client.id,
        title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Описание работ для проверки уведомлений',
        address: 'Москва, ул. Тестовая, 1',
        squareMeters: 60,
        clientBudget: '90000.00',
        status: OrderStatus.WAITING,
      },
    });
  }

  function postOffer(token: string, orderId: string) {
    return request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        proposedPrice: '85000.00',
        proposedDeadline: inDays(60),
        comment: 'Возьмёмся',
      });
  }

  /** Список уведомлений пользователя. Размер страницы задан с запасом. */
  async function listNotifications(
    token: string,
    query: Record<string, string> = {},
  ): Promise<NotificationDto[]> {
    const response = await request(app.getHttpServer())
      .get('/notifications')
      .query({ pageSize: '100', ...query })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body.items;
  }

  async function unreadCount(token: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body.count;
  }

  /** Убрать все уведомления пользователя: тесты считают их поштучно. */
  function clearNotifications(userId: string) {
    return prisma.notification.deleteMany({ where: { userId } });
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, company] = await Promise.all([
      users.createUser('notif-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('notif-company', {
        role: Role.COMPANY,
        companyName: 'ООО «Альфастрой»',
      }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [clientToken, companyToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(company),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await users.dropUsers();
  });

  describe('GET /notifications', () => {
    it('отдаёт уведомление, созданное переходом статуса', async () => {
      await clearNotifications(client.id);
      const order = await seedOrder('Ремонт под ключ');

      expect((await postOffer(companyToken, order.id)).status).toBe(201);

      const items = await listNotifications(clientToken);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: NotificationType.OFFER_RECEIVED,
        orderId: order.id,
        title: 'Новое предложение',
        isRead: false,
      });
      expect(items[0]!.body).toContain(`ORD-${order.orderNumber}`);
    });

    it('чужие уведомления в список не попадают', async () => {
      await Promise.all([
        clearNotifications(client.id),
        clearNotifications(company.id),
      ]);

      const order = await seedOrder('Проект дома');
      await postOffer(companyToken, order.id);

      // Уведомление адресовано клиенту: компании о собственном действии
      // сообщать нечего.
      expect(await listNotifications(companyToken)).toEqual([]);
      expect(await listNotifications(clientToken)).toHaveLength(1);
    });

    it('фильтрует по прочитанности в обе стороны', async () => {
      await clearNotifications(client.id);
      const order = await seedOrder('Кровля');
      await postOffer(companyToken, order.id);

      const [unreadItem] = await listNotifications(clientToken, { unread: 'true' });
      expect(unreadItem).toBeDefined();
      expect(await listNotifications(clientToken, { unread: 'false' })).toEqual([]);

      const marked = await request(app.getHttpServer())
        .post(`/notifications/${unreadItem!.id}/read`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(marked.status).toBe(200);

      expect(await listNotifications(clientToken, { unread: 'true' })).toEqual([]);
      expect(await listNotifications(clientToken, { unread: 'false' })).toHaveLength(1);
    });

    it('на непонятное значение unread отвечает 400, а не полным списком', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .query({ unread: 'yes' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(400);
    });

    it('ставит непрочитанные выше прочитанных', async () => {
      await clearNotifications(client.id);

      const first = await seedOrder('Первый заказ');
      await postOffer(companyToken, first.id);

      const [older] = await listNotifications(clientToken);
      await request(app.getHttpServer())
        .post(`/notifications/${older!.id}/read`)
        .set('Authorization', `Bearer ${clientToken}`);

      const second = await seedOrder('Второй заказ');
      await postOffer(companyToken, second.id);

      const items = await listNotifications(clientToken);

      expect(items).toHaveLength(2);
      expect(items[0]!.isRead).toBe(false);
      expect(items[1]!.isRead).toBe(true);
    });

    it('без токена не отдаёт ничего', async () => {
      const response = await request(app.getHttpServer()).get('/notifications');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /notifications/:id/read и read-all', () => {
    it('счётчик непрочитанных сходится со списком', async () => {
      await clearNotifications(client.id);
      const order = await seedOrder('Фасад');
      await postOffer(companyToken, order.id);

      expect(await unreadCount(clientToken)).toBe(1);

      const [item] = await listNotifications(clientToken);
      await request(app.getHttpServer())
        .post(`/notifications/${item!.id}/read`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(await unreadCount(clientToken)).toBe(0);
    });

    it('чужое уведомление не помечает и отдаёт 404', async () => {
      await clearNotifications(client.id);
      const order = await seedOrder('Санузел');
      await postOffer(companyToken, order.id);

      const [item] = await listNotifications(clientToken);

      const response = await request(app.getHttpServer())
        .post(`/notifications/${item!.id}/read`)
        .set('Authorization', `Bearer ${companyToken}`);

      // 404, а не 403: 403 подтвердил бы существование чужой строки.
      expect(response.status).toBe(404);

      const after = await prisma.notification.findUniqueOrThrow({
        where: { id: item!.id },
      });
      expect(after.isRead).toBe(false);
    });

    it('на мусор в идентификаторе отвечает 404, а не 500', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications/не-uuid/read')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(404);
    });

    it('read-all помечает только свои и отдаёт их число', async () => {
      await Promise.all([
        clearNotifications(client.id),
        clearNotifications(company.id),
      ]);

      const [first, second] = await Promise.all([
        seedOrder('Первый'),
        seedOrder('Второй'),
      ]);
      await postOffer(companyToken, first.id);
      await postOffer(companyToken, second.id);

      const response = await request(app.getHttpServer())
        .post('/notifications/read-all')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ marked: 2 });
      expect(await unreadCount(clientToken)).toBe(0);

      // Повторное нажатие — ноль, а не ошибка.
      const again = await request(app.getHttpServer())
        .post('/notifications/read-all')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(again.body).toEqual({ marked: 0 });
    });
  });

  describe('Удаление заказа', () => {
    it('извещает компанию и переживает сам заказ', async () => {
      await clearNotifications(company.id);
      const order = await seedOrder('Заказ под удаление');
      expect((await postOffer(companyToken, order.id)).status).toBe(201);

      const deleted = await request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(deleted.status).toBe(204);

      // Заказа больше нет, а уведомление осталось: с onDelete Cascade оно
      // удалилось бы той же операцией, которая его породила.
      expect(await prisma.order.findUnique({ where: { id: order.id } })).toBeNull();

      const items = await listNotifications(companyToken);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: NotificationType.ORDER_DELETED,
        title: 'Заказ удалён',
        // Вести некуда — заказа нет. Номер остаётся в тексте.
        orderId: null,
      });
      expect(items[0]!.body).toContain(`ORD-${order.orderNumber}`);
    });

    it('не извещает компанию, отозвавшую предложение', async () => {
      await clearNotifications(company.id);
      const order = await seedOrder('Заказ с отозванным предложением');

      const offer = await postOffer(companyToken, order.id);
      const withdrawn = await request(app.getHttpServer())
        .post(`/offers/${offer.body.id}/withdraw`)
        .set('Authorization', `Bearer ${companyToken}`);
      expect(withdrawn.status).toBe(200);

      await clearNotifications(company.id);

      const deleted = await request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(deleted.status).toBe(204);

      // Для такой компании заказ уже чужой (ТЗ §4.1) — сообщать не о чем.
      expect(await listNotifications(companyToken)).toEqual([]);
    });
  });
});
