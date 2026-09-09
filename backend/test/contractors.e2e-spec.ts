import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
  type ContractorCard,
} from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * Каталог подрядчиков на живой базе (DoD подфазы 6.1).
 *
 * Помимо самих двух маршрутов здесь проверяется закрытость: компания каталог
 * не видит вовсе, а профиль клиента через `/contractors/:id` не читается.
 *
 * Каталог общий на всю базу, поэтому фикстуры этого файла узнаются по метке
 * в названии компании: соседние наборы e2e и seed тоже заводят компании,
 * и «список из двух строк» здесь проверить нельзя.
 */

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('contractors');

/** Метка этого прогона — она же поисковый запрос, находящий ровно наши строки. */
const MARK = randomUUID().slice(0, 8);

describe('Подрядчики (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let client: E2eUser;
  let alpha: E2eUser;
  let beta: E2eUser;

  let clientToken: string;
  let companyToken: string;

  async function listContractors(
    token: string,
    query: Record<string, string> = {},
  ): Promise<ContractorCard[]> {
    const response = await request(app.getHttpServer())
      .get('/contractors')
      .query({ pageSize: '100', q: MARK, ...query })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body.items;
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, alpha, beta] = await Promise.all([
      users.createUser('catalog-client', {
        role: Role.CLIENT,
        firstName: 'Анна',
        city: 'Москва',
      }),
      users.createUser('catalog-alpha', {
        role: Role.COMPANY,
        // Названия начинаются с меток «А» и «Б»: порядок в каталоге алфавитный.
        companyName: `Альфастрой ${MARK}`,
        city: 'Москва',
        country: 'Россия',
      }),
      users.createUser('catalog-beta', {
        role: Role.COMPANY,
        companyName: `Бетастрой ${MARK}`,
        city: 'Казань',
        country: 'Россия',
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
      signInE2eUser(alpha),
    ]);

    // Завершённый заказ «Альфастроя» — по нему считается completedOrdersCount.
    await prisma.order.create({
      data: {
        clientId: client.id,
        title: 'Завершённый заказ',
        category: OrderCategory.PLAN_CREATION,
        objectType: ObjectType.APARTMENT,
        description: 'Заказ, доведённый до конца',
        address: 'Москва, ул. Тестовая, 3',
        squareMeters: 55,
        status: OrderStatus.COMPLETED,
        price: '70000.00',
        offers: {
          create: [
            {
              companyId: alpha.id,
              status: OfferStatus.COMPLETED,
              proposedPrice: '70000.00',
              proposedDeadline: new Date('2027-01-01T00:00:00.000Z'),
            },
            {
              // Проигравшая компания завершённым заказом не хвастается.
              companyId: beta.id,
              status: OfferStatus.NOT_ACCEPTED,
              proposedPrice: '90000.00',
              proposedDeadline: new Date('2027-02-01T00:00:00.000Z'),
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await users.dropUsers();
  });

  describe('GET /contractors', () => {
    it('отдаёт компании с контактами и числом завершённых заказов', async () => {
      const items = await listContractors(clientToken);

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        id: alpha.id,
        companyName: `Альфастрой ${MARK}`,
        city: 'Москва',
        country: 'Россия',
        email: alpha.email,
        phone: '+7 900 000-00-00',
        completedOrdersCount: 1,
      });
      // Предложение, которое не выбрали, завершённым заказом не считается.
      expect(items[1]!.completedOrdersCount).toBe(0);
    });

    it('сортирует по алфавиту', async () => {
      const items = await listContractors(clientToken);

      expect(items.map((item) => item.companyName)).toEqual([
        `Альфастрой ${MARK}`,
        `Бетастрой ${MARK}`,
      ]);
    });

    it('клиентов в каталог не пускает', async () => {
      // Поиск по имени клиента: без условия по роли он нашёлся бы здесь
      // вместе со своим телефоном.
      const items = await listContractors(clientToken, { q: 'Анна' });

      expect(items.some((item) => item.id === client.id)).toBe(false);
    });

    it('ищет по названию и по городу', async () => {
      const byName = await listContractors(clientToken, { q: `Бетастрой ${MARK}` });
      expect(byName.map((item) => item.id)).toEqual([beta.id]);

      const byCity = await listContractors(clientToken, { q: 'Казань' });
      expect(byCity.map((item) => item.id)).toContain(beta.id);
      expect(byCity.map((item) => item.id)).not.toContain(alpha.id);
    });

    it('компании каталог не отдаёт', async () => {
      const response = await request(app.getHttpServer())
        .get('/contractors')
        .set('Authorization', `Bearer ${companyToken}`);

      expect(response.status).toBe(403);
    });

    it('без токена не отдаёт ничего', async () => {
      const response = await request(app.getHttpServer()).get('/contractors');

      expect(response.status).toBe(401);
    });

    it('считает страницы', async () => {
      const response = await request(app.getHttpServer())
        .get('/contractors')
        .query({ q: MARK, pageSize: '1', page: '2' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(beta.id);
    });
  });

  describe('GET /contractors/:id', () => {
    it('отдаёт карточку компании', async () => {
      const response = await request(app.getHttpServer())
        .get(`/contractors/${alpha.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: alpha.id,
        companyName: `Альфастрой ${MARK}`,
        city: 'Москва',
        completedOrdersCount: 1,
      });
    });

    it('профиль клиента по этому адресу не читается', async () => {
      const response = await request(app.getHttpServer())
        .get(`/contractors/${client.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      // 404, а не профиль: адрес отдаёт только компании (ТЗ §5).
      expect(response.status).toBe(404);
    });

    it('на мусор в идентификаторе отвечает 404, а не 500', async () => {
      const response = await request(app.getHttpServer())
        .get('/contractors/не-uuid')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(404);
    });

    it('компании карточку не отдаёт', async () => {
      const response = await request(app.getHttpServer())
        .get(`/contractors/${beta.id}`)
        .set('Authorization', `Bearer ${companyToken}`);

      expect(response.status).toBe(403);
    });
  });
});
