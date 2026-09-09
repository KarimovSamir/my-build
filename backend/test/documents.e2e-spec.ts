import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FileOwnerType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
  type DocumentListItem,
} from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * Раздел «Документы» на живой базе (DoD подфазы 6.1).
 *
 * Строки `OrderFile` создаются напрямую: этот маршрут только выбирает их
 * из базы и в хранилище не ходит. Загрузку и подпись проверяет
 * `files.e2e-spec.ts`, повторять её здесь незачем.
 */

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('documents');

describe('Документы (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let client: E2eUser;
  let otherClient: E2eUser;
  let executor: E2eUser;
  let bidder: E2eUser;

  let clientToken: string;
  let executorToken: string;
  let bidderToken: string;

  /** Заказ клиента с принятым предложением исполнителя. */
  let dealOrder: { id: string; orderNumber: number };
  /** Заказ того же клиента, который ещё ищет исполнителя. */
  let openOrder: { id: string };
  /** Чужой заказ — его файлы не должен видеть никто из наших. */
  let foreignOrder: { id: string };

  function seedFile(
    orderId: string,
    ownerType: FileOwnerType,
    submissionRound: number,
    originalName: string,
  ) {
    return prisma.orderFile.create({
      data: {
        orderId,
        ownerType,
        submissionRound,
        originalName,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        fileHash: randomUUID().replaceAll('-', ''),
        storageKey: `orders/${orderId}/${randomUUID()}.pdf`,
      },
    });
  }

  async function listDocuments(
    token: string,
    query: Record<string, string> = {},
  ): Promise<DocumentListItem[]> {
    const response = await request(app.getHttpServer())
      .get('/documents')
      .query({ pageSize: '100', ...query })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body.items;
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, otherClient, executor, bidder] = await Promise.all([
      users.createUser('docs-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('docs-other-client', { role: Role.CLIENT, firstName: 'Пётр' }),
      users.createUser('docs-executor', {
        role: Role.COMPANY,
        companyName: 'ООО «Исполнитель»',
      }),
      users.createUser('docs-bidder', {
        role: Role.COMPANY,
        companyName: 'ООО «Претендент»',
      }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [clientToken, executorToken, bidderToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(executor),
      signInE2eUser(bidder),
    ]);

    dealOrder = await prisma.order.create({
      data: {
        clientId: client.id,
        title: 'Заказ в работе',
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Заказ с принятым предложением',
        address: 'Москва, ул. Тестовая, 4',
        squareMeters: 48,
        status: OrderStatus.IN_PROGRESS,
        price: '80000.00',
        offers: {
          create: {
            companyId: executor.id,
            status: OfferStatus.ACCEPTED,
            proposedPrice: '80000.00',
            proposedDeadline: new Date('2027-03-01T00:00:00.000Z'),
          },
        },
      },
      select: { id: true, orderNumber: true },
    });

    openOrder = await prisma.order.create({
      data: {
        clientId: client.id,
        title: 'Заказ ищет исполнителя',
        category: OrderCategory.PLAN_CREATION,
        objectType: ObjectType.HOUSE,
        description: 'Заказ, по которому идут предложения',
        address: 'Москва, ул. Тестовая, 5',
        squareMeters: 120,
        status: OrderStatus.AWAITING_CONFIRMATION,
        offers: {
          create: {
            companyId: bidder.id,
            status: OfferStatus.SENT,
            proposedPrice: '150000.00',
            proposedDeadline: new Date('2027-04-01T00:00:00.000Z'),
          },
        },
      },
      select: { id: true },
    });

    foreignOrder = await prisma.order.create({
      data: {
        clientId: otherClient.id,
        title: 'Чужой заказ',
        category: OrderCategory.PLAN_CREATION,
        objectType: ObjectType.COMMERCIAL,
        description: 'Заказ другого клиента',
        address: 'Казань, ул. Чужая, 1',
        squareMeters: 300,
        status: OrderStatus.WAITING,
      },
      select: { id: true },
    });

    // Порядок создания — от старого к новому: список отдаёт новые сверху.
    await seedFile(dealOrder.id, FileOwnerType.CLIENT, 0, 'Задание.pdf');
    await seedFile(dealOrder.id, FileOwnerType.COMPANY, 1, 'Сдача 1.pdf');
    await seedFile(openOrder.id, FileOwnerType.CLIENT, 0, 'Чертёж дома.pdf');
    await seedFile(foreignOrder.id, FileOwnerType.CLIENT, 0, 'Чужое задание.pdf');
  });

  afterAll(async () => {
    await app?.close();
    await users.dropUsers();
  });

  describe('GET /documents', () => {
    it('отдаёт клиенту файлы всех его заказов вместе с номером заказа', async () => {
      const items = await listDocuments(clientToken);

      expect(items.map((item) => item.originalName)).toEqual([
        'Чертёж дома.pdf',
        'Сдача 1.pdf',
        'Задание.pdf',
      ]);

      const submission = items.find((item) => item.originalName === 'Сдача 1.pdf')!;
      expect(submission).toMatchObject({
        orderId: dealOrder.id,
        orderNumber: dealOrder.orderNumber,
        orderTitle: 'Заказ в работе',
        ownerType: FileOwnerType.COMPANY,
        submissionRound: 1,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });
      // Путь в хранилище наружу не уходит.
      expect(submission).not.toHaveProperty('storageKey');
    });

    it('чужие файлы клиенту не отдаёт', async () => {
      const items = await listDocuments(clientToken);

      expect(items.some((item) => item.orderId === foreignOrder.id)).toBe(false);
    });

    it('исполнителю отдаёт и задание клиента, и свою сдачу', async () => {
      const items = await listDocuments(executorToken);

      expect(items.map((item) => item.originalName)).toEqual([
        'Сдача 1.pdf',
        'Задание.pdf',
      ]);
      expect(items.every((item) => item.orderId === dealOrder.id)).toBe(true);
    });

    it('компании с непринятым предложением не отдаёт ничего', async () => {
      // Заказ ей ещё не принадлежит: задание она скачать может (§4.1), но
      // раздел — про свои файлы по своим заказам, а не про всё, к чему есть
      // доступ. Иначе список менялся бы сам, когда клиент выбирает другого.
      expect(await listDocuments(bidderToken)).toEqual([]);
    });

    it('фильтрует по владельцу файла', async () => {
      const submissions = await listDocuments(clientToken, {
        ownerType: FileOwnerType.COMPANY,
      });

      expect(submissions.map((item) => item.originalName)).toEqual(['Сдача 1.pdf']);

      const tasks = await listDocuments(clientToken, { ownerType: FileOwnerType.CLIENT });
      expect(tasks.map((item) => item.originalName)).toEqual([
        'Чертёж дома.pdf',
        'Задание.pdf',
      ]);
    });

    it('фильтрует по заказу', async () => {
      const items = await listDocuments(clientToken, { orderId: dealOrder.id });

      expect(items).toHaveLength(2);
      expect(items.every((item) => item.orderId === dealOrder.id)).toBe(true);
    });

    it('фильтр по чужому заказу ничего не открывает', async () => {
      expect(await listDocuments(clientToken, { orderId: foreignOrder.id })).toEqual([]);
    });

    it('на мусор в orderId отвечает 400, а не 500', async () => {
      const response = await request(app.getHttpServer())
        .get('/documents')
        .query({ orderId: 'не-uuid' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(400);
    });

    it('на неизвестный ownerType отвечает 400, а не полным списком', async () => {
      const response = await request(app.getHttpServer())
        .get('/documents')
        .query({ ownerType: 'EVERYONE' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(400);
    });

    it('считает страницы', async () => {
      const response = await request(app.getHttpServer())
        .get('/documents')
        .query({ pageSize: '2', page: '2' })
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
      expect(response.body.items).toHaveLength(1);
    });

    it('без токена не отдаёт ничего', async () => {
      const response = await request(app.getHttpServer()).get('/documents');

      expect(response.status).toBe(401);
    });
  });
});
