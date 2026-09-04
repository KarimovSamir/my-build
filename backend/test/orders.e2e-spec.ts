import 'dotenv/config';

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
  formatOrderNumber,
} from '@mybuild/shared';

import { FilesService } from '../src/modules/files/files.service.js';
import { prepareFile } from '../src/modules/files/uploaded-file.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('orders');
import { pdfBytes, pngBytes, removeWrittenUploads, writeUpload } from './support/uploads.js';

/**
 * Маршруты заказов на живой базе (DoD подфазы 3.2): создание с файлами,
 * список с поиском и пагинацией, ролезависимые детали, удаление.
 *
 * Правила видимости отдельно покрыты unit-тестами без сети
 * (`src/modules/orders/order-view.spec.ts`). Здесь проверяется, что до них
 * доходит настоящий HTTP-запрос и что guard'ы пускают ровно тех, кого надо.
 *
 * Бакет должен существовать: `npm run storage:setup -w backend`.
 */

const PDF = pdfBytes('план квартиры');
const PNG = pngBytes('фото объекта');

/** Файл в том виде, в каком его отдаёт multer: содержимое лежит на диске. */
function upload(originalName: string, mimeType: string, content: Buffer) {
  return prepareFile(writeUpload(originalName, mimeType, content));
}

/** Завтрашний день — допустимая желаемая дата начала. */
function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('Заказы (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let files: FilesService;

  let client: E2eUser;
  let lister: E2eUser;
  let stranger: E2eUser;
  let executor: E2eUser;
  let outsider: E2eUser;
  /** Только для теста ограничителя частоты: его лимит выбирается целиком. */
  let throttled: E2eUser;

  let clientToken: string;
  let listerToken: string;
  let strangerToken: string;
  let executorToken: string;
  let outsiderToken: string;
  let throttledToken: string;

  /** Заказы «читателя списков»: их состав фиксирован, чтобы счёт сходился. */
  let waitingId: string;
  let inProgressId: string;
  let planId: string;
  let inProgressNumber: number;

  /** Заказы, которые создаются и удаляются по ходу, — на них живут файлы. */
  const createdOrderIds: string[] = [];

  async function seedOrder(data: {
    clientId: string;
    title: string;
    status?: OrderStatus;
    offer?: { companyId: string; status: OfferStatus };
  }) {
    return prisma.order.create({
      data: {
        clientId: data.clientId,
        title: data.title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Описание работ для проверки списка',
        address: 'Москва, ул. Тестовая, 1',
        squareMeters: 60,
        clientBudget: '90000.00',
        status: data.status ?? OrderStatus.WAITING,
        ...(data.offer
          ? {
              price: '85000.00',
              deadline: new Date('2027-05-01T00:00:00.000Z'),
              offers: {
                create: [
                  {
                    companyId: data.offer.companyId,
                    status: data.offer.status,
                    proposedPrice: '85000.00',
                    proposedDeadline: new Date('2027-05-01T00:00:00.000Z'),
                    comment: 'Возьмёмся',
                  },
                ],
              },
            }
          : {}),
      },
    });
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, lister, stranger, executor, outsider, throttled] = await Promise.all([
      users.createUser('orders-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('orders-lister', { role: Role.CLIENT, firstName: 'Борис' }),
      users.createUser('orders-stranger', { role: Role.CLIENT, firstName: 'Виктор' }),
      users.createUser('orders-executor', {
        role: Role.COMPANY,
        companyName: 'ООО «Строймир»',
      }),
      users.createUser('orders-outsider', {
        role: Role.COMPANY,
        companyName: 'ООО «Посторонняя»',
      }),
      users.createUser('orders-throttled', { role: Role.CLIENT, firstName: 'Глеб' }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    files = app.get(FilesService);

    [
      clientToken,
      listerToken,
      strangerToken,
      executorToken,
      outsiderToken,
      throttledToken,
    ] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(lister),
      signInE2eUser(stranger),
      signInE2eUser(executor),
      signInE2eUser(outsider),
      signInE2eUser(throttled),
    ]);

    // Строго по очереди: список сортируется по времени создания, и при
    // параллельной вставке порядок оказался бы случайным.
    const waiting = await seedOrder({
      clientId: lister.id,
      title: 'Ремонт квартиры на Тверской',
    });
    const inProgress = await seedOrder({
      clientId: lister.id,
      title: 'Кровля склада',
      status: OrderStatus.IN_PROGRESS,
      offer: { companyId: executor.id, status: OfferStatus.ACCEPTED },
    });
    const plan = await seedOrder({
      clientId: lister.id,
      title: 'Проект загородного дома',
    });

    waitingId = waiting.id;
    inProgressId = inProgress.id;
    inProgressNumber = inProgress.orderNumber;
    planId = plan.id;

    // Заказ другого клиента: в чужие списки и детали попасть не должен.
    await seedOrder({ clientId: stranger.id, title: 'Чужой заказ' });

    // Файлы на заказе «в работе» — по ним проверяется доступ компаний.
    await files.attachFiles({
      orderId: inProgressId,
      ownerType: 'CLIENT',
      submissionRound: 0,
      files: [await upload('Задание.pdf', 'application/pdf', PDF)],
    });
  });

  afterAll(async () => {
    // Каскад уносит строки OrderFile, но не объекты в бакете.
    await Promise.all(
      [inProgressId, ...createdOrderIds]
        .filter(Boolean)
        .map((id) => files.removeStorageObjectsForOrder(id).catch(() => undefined)),
    );
    await app?.close();
    removeWrittenUploads();
    await users.dropUsers();
  });

  describe('POST /orders', () => {
    it('создаёт заказ со всеми полями и файлами', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Ремонт квартиры 100м²')
        .field('category', OrderCategory.PLAN_IMPLEMENTATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Полный ремонт под ключ, с заменой проводки')
        .field('address', 'Москва, ул. Тестовая, 5')
        .field('squareMeters', '100.5')
        .field('clientBudget', '150000.50')
        .field('desiredStartDate', tomorrow())
        .attach('files', PDF, {
          filename: 'План квартиры.pdf',
          contentType: 'application/pdf',
        })
        .attach('files', PNG, { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(201);
      createdOrderIds.push(response.body.id);

      expect(response.body).toMatchObject({
        title: 'Ремонт квартиры 100м²',
        status: OrderStatus.WAITING,
        squareMeters: 100.5,
        clientBudget: '150000.5',
        address: 'Москва, ул. Тестовая, 5',
        // Цена и срок появляются только при принятии предложения (ТЗ §3).
        price: null,
        deadline: null,
        contractorName: null,
        offers: [],
      });
      expect(response.body.orderNumber).toBeGreaterThan(0);

      // Кириллица в имени файла не должна ломаться на границе multipart.
      expect(response.body.files.map((file: { originalName: string }) => file.originalName))
        .toEqual(['План квартиры.pdf', 'photo.png']);
      expect(response.body.files.every((file: { submissionRound: number }) => file.submissionRound === 0)).toBe(true);
    });

    it('создаёт заказ без файлов и без необязательных полей', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Заказ без файлов')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.HOUSE)
        .field('description', 'Нужен проект дома на участке')
        .field('address', 'Казань, ул. Проверочная, 2')
        .field('squareMeters', '80')
        // Браузер отправляет незаполненные поля пустыми строками, а не пропускает их.
        .field('clientBudget', '')
        .field('desiredStartDate', '');

      expect(response.status).toBe(201);
      createdOrderIds.push(response.body.id);

      expect(response.body).toMatchObject({
        clientBudget: null,
        desiredStartDate: null,
        files: [],
      });
    });

    it('без обязательного поля отдаёт 400 со списком сообщений', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Нет описания')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('address', 'Москва, ул. Тестовая, 7')
        .field('squareMeters', '50');

      expect(response.status).toBe(400);
      expect(String(response.body.message)).toContain('Описание работ');
    });

    it('не принимает желаемую дату начала в прошлом', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Заказ из прошлого')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Описание достаточной длины')
        .field('address', 'Москва, ул. Тестовая, 8')
        .field('squareMeters', '50')
        .field('desiredStartDate', '2020-01-01');

      expect(response.status).toBe(400);
      expect(String(response.body.message)).toContain('не может быть в прошлом');
    });

    it('не принимает отрицательную площадь и неизвестную категорию', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Странный заказ')
        .field('category', 'DEMOLITION')
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Описание достаточной длины')
        .field('address', 'Москва, ул. Тестовая, 9')
        .field('squareMeters', '-5');

      expect(response.status).toBe(400);
      expect(String(response.body.message)).toContain('категорию');
      expect(String(response.body.message)).toContain('больше нуля');
    });

    it('файл недопустимого типа отменяет создание заказа целиком', async () => {
      const before = await prisma.order.count({ where: { clientId: client.id } });

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Заказ с чужим файлом')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Описание достаточной длины')
        .field('address', 'Москва, ул. Тестовая, 10')
        .field('squareMeters', '50')
        .attach('files', Buffer.from('MZ'), {
          filename: 'вирус.exe',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(await prisma.order.count({ where: { clientId: client.id } })).toBe(before);
    });

    it('файл с чужим содержимым под видом PDF отменяет создание заказа', async () => {
      // Расширение и заявленный тип клиент задаёт сам — проверяем первые байты.
      const before = await prisma.order.count({ where: { clientId: client.id } });

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Заказ с подменённым файлом')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Описание достаточной длины')
        .field('address', 'Москва, ул. Тестовая, 11')
        .field('squareMeters', '50')
        .attach('files', Buffer.from('MZ\x90\x00исполняемый'), {
          filename: 'план.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(String(response.body.message)).toContain('содержимое не похоже');
      expect(await prisma.order.count({ where: { clientId: client.id } })).toBe(before);
    });

    it('компании создавать заказы нельзя', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${executorToken}`)
        .field('title', 'Заказ от компании')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.APARTMENT)
        .field('description', 'Описание достаточной длины')
        .field('address', 'Москва, ул. Тестовая, 11')
        .field('squareMeters', '50');

      expect(response.status).toBe(403);
    });

    it('без токена — 401', async () => {
      const response = await request(app.getHttpServer()).post('/orders');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /orders', () => {
    it('отдаёт только свои заказы, новые сверху', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 3, page: 1, pageSize: 20, totalPages: 1 });
      expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
        'Проект загородного дома',
        'Кровля склада',
        'Ремонт квартиры на Тверской',
      ]);
    });

    it('подставляет подрядчика в строку заказа в работе', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${listerToken}`);

      const row = response.body.items.find(
        (item: { id: string }) => item.id === inProgressId,
      );

      expect(row).toMatchObject({
        status: OrderStatus.IN_PROGRESS,
        contractorName: 'ООО «Строймир»',
        price: '85000',
      });
    });

    it('фильтрует по статусу', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ status: OrderStatus.WAITING })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(
        response.body.items.every(
          (item: { status: string }) => item.status === OrderStatus.WAITING,
        ),
      ).toBe(true);
    });

    it('неизвестный статус — 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ status: 'FROZEN' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(400);
    });

    it('ищет по номеру заказа — и с префиксом ORD-, и без него', async () => {
      const withPrefix = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: formatOrderNumber(inProgressNumber) })
        .set('Authorization', `Bearer ${listerToken}`);

      const bare = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: String(inProgressNumber) })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(withPrefix.body.total).toBe(1);
      expect(withPrefix.body.items[0].id).toBe(inProgressId);
      expect(bare.body.items[0].id).toBe(inProgressId);
    });

    it('ищет по названию заказа без учёта регистра', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: 'кРОВЛЯ' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(inProgressId);
    });

    it('ищет по названию подрядчика', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: 'Строймир' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(inProgressId);
    });

    it('длинная строка цифр в поиске не роняет запрос', async () => {
      // Номер заказа — колонка Int. Без отсечения в parseOrderNumber такое
      // число доходило до базы и падало там: пользователь получал 500.
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: '99999999999999999999' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
    });

    it('подстановочные символы LIKE ищутся буквально', async () => {
      // Без экранирования «%» совпал бы со всеми заказами, «_» — с любым символом.
      const percent = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: '%' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(percent.status).toBe(200);
      expect(percent.body.total).toBe(0);

      // «Ремонт_квартиры» без экранирования совпало бы с «Ремонт квартиры…»:
      // подчёркивание в LIKE заменяет любой один символ.
      const underscore = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: 'Ремонт_квартиры' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(underscore.body.total).toBe(0);
    });

    it('поиск без совпадений отдаёт пустую страницу, а не ошибку', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ q: 'такого-заказа-нет' })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ items: [], total: 0, totalPages: 1 });
    });

    it('разбивает на страницы', async () => {
      const first = await request(app.getHttpServer())
        .get('/orders')
        .query({ page: 1, pageSize: 2 })
        .set('Authorization', `Bearer ${listerToken}`);

      const second = await request(app.getHttpServer())
        .get('/orders')
        .query({ page: 2, pageSize: 2 })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(first.body).toMatchObject({ total: 3, totalPages: 2 });
      expect(first.body.items).toHaveLength(2);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.items[0].id).toBe(waitingId);
    });

    it('не даёт запросить страницу больше потолка', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .query({ pageSize: 1000 })
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(400);
    });

    it('компании список заказов клиента недоступен', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${executorToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /orders/:id', () => {
    it('владельцу отдаёт заказ целиком', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${inProgressId}`)
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: inProgressId,
        status: OrderStatus.IN_PROGRESS,
        contractorName: 'ООО «Строймир»',
        price: '85000',
      });
      expect(response.body.files).toHaveLength(1);
      expect(response.body.offers).toHaveLength(1);
      expect(response.body.client).toMatchObject({ firstName: 'Борис' });
    });

    it('компании-исполнителю отдаёт настоящий статус и файлы', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${inProgressId}`)
        .set('Authorization', `Bearer ${executorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(OrderStatus.IN_PROGRESS);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.offers.map((offer: { companyId: string }) => offer.companyId)).toEqual([
        executor.id,
      ]);
    });

    it('посторонней компании показывает заказ как WAITING и без файлов', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${inProgressId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: OrderStatus.WAITING,
        price: null,
        deadline: null,
        contractorName: null,
        offers: [],
        files: [],
      });
      // Задание клиента компания видит: по нему она и подаёт предложение.
      expect(response.body.description).toBeTruthy();
      // А вот кто заказчик — нет (ТЗ §4.1, приватность).
      expect(response.body.client).toBeNull();
    });

    it('стороны сделки заказчика видят', async () => {
      const [owner, executorView] = await Promise.all([
        request(app.getHttpServer())
          .get(`/orders/${inProgressId}`)
          .set('Authorization', `Bearer ${listerToken}`),
        request(app.getHttpServer())
          .get(`/orders/${inProgressId}`)
          .set('Authorization', `Bearer ${executorToken}`),
      ]);

      expect(owner.body.client).toMatchObject({ id: lister.id, firstName: 'Борис' });
      expect(executorView.body.client).toMatchObject({ id: lister.id });
    });

    it('чужому клиенту отдаёт 404, а не 403: чужой заказ для него не существует', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${inProgressId}`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(response.status).toBe(404);
    });

    it('несуществующий заказ — 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(404);
    });

    it('идентификатор не в форме UUID — 404, а не 500', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders/не-uuid')
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(404);
    });

    it('без токена — 401', async () => {
      const response = await request(app.getHttpServer()).get(`/orders/${inProgressId}`);
      expect(response.status).toBe(401);
    });
  });

  /**
   * Скачивание файла заказа (ТЗ §5). Маршрут живёт в модуле `files`, но
   * проверяется здесь: фикстуры этого файла как раз дают заказ с файлом,
   * компанию-исполнителя и двух посторонних.
   *
   * Правила доступа покрыты unit- и e2e-тестами самого сервиса; здесь важно,
   * что до них доходит HTTP-запрос и что ссылка действительно рабочая.
   */
  describe('GET /documents/:id/download', () => {
    async function clientFileId(): Promise<string> {
      const file = await prisma.orderFile.findFirstOrThrow({
        where: { orderId: inProgressId },
      });

      return file.id;
    }

    it('владельцу отдаёт ссылку, по которой скачивается тот самый файл', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${await clientFileId()}/download`)
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.originalName).toBe('Задание.pdf');

      const downloaded = await fetch(response.body.url);
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it('компания-исполнитель ссылку получает', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${await clientFileId()}/download`)
        .set('Authorization', `Bearer ${executorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.url).toContain('token=');
    });

    it('посторонней компании файл не отдаётся', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${await clientFileId()}/download`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(response.status).toBe(403);
    });

    it('чужому клиенту файл не отдаётся', async () => {
      const response = await request(app.getHttpServer())
        .get(`/documents/${await clientFileId()}/download`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(response.status).toBe(403);
    });

    it('несуществующий файл — 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/documents/00000000-0000-4000-8000-000000000000/download')
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(404);
    });

    it('идентификатор не в форме UUID — 404, а не 500', async () => {
      const response = await request(app.getHttpServer())
        .get('/documents/не-uuid/download')
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(404);
    });

    it('без токена — 401', async () => {
      const response = await request(app.getHttpServer()).get(
        `/documents/${await clientFileId()}/download`,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /orders/:id', () => {
    it('удаляет свой заказ в статусе поиска исполнителя вместе с файлами', async () => {
      const order = await seedOrder({ clientId: client.id, title: 'Заказ на удаление' });

      await files.attachFiles({
        orderId: order.id,
        ownerType: 'CLIENT',
        submissionRound: 0,
        files: [await upload('смета.pdf', 'application/pdf', PDF)],
      });

      const response = await request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(204);
      expect(await prisma.order.findUnique({ where: { id: order.id } })).toBeNull();
      expect(await prisma.orderFile.count({ where: { orderId: order.id } })).toBe(0);
    });

    it('удаляет заказ, по которому уже есть предложения', async () => {
      const order = await seedOrder({
        clientId: client.id,
        title: 'Заказ с предложением',
        status: OrderStatus.AWAITING_CONFIRMATION,
        offer: { companyId: outsider.id, status: OfferStatus.SENT },
      });

      const response = await request(app.getHttpServer())
        .delete(`/orders/${order.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(204);
      expect(await prisma.offer.count({ where: { orderId: order.id } })).toBe(0);
    });

    it('заказ в работе удалить нельзя — 409', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/orders/${inProgressId}`)
        .set('Authorization', `Bearer ${listerToken}`);

      expect(response.status).toBe(409);
      expect(String(response.body.message)).toContain('нельзя удалить');
      expect(await prisma.order.findUnique({ where: { id: inProgressId } })).not.toBeNull();
    });

    it('чужой заказ удалить нельзя — 404', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/orders/${planId}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(404);
      expect(await prisma.order.findUnique({ where: { id: planId } })).not.toBeNull();
    });

    it('компания удалять заказы не может — 403', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/orders/${waitingId}`)
        .set('Authorization', `Bearer ${executorToken}`);

      expect(response.status).toBe(403);
    });
  });

  /**
   * Правила самого ограничителя проверены unit-тестами
   * (`src/common/guards/throttle.guard.spec.ts`). Здесь важно одно:
   * что он действительно висит на маршруте создания заказа (ТЗ §6).
   *
   * Запросы намеренно невалидные — guard'ы отрабатывают раньше валидации,
   * поэтому лимит считается, а база не трогается.
   *
   * Пользователь заведён ровно под этот тест и больше нигде не используется:
   * окно ограничителя живёт в памяти приложения и переносится между тестами
   * внутри файла, поэтому любой `POST /orders` от того же пользователя ниже
   * по файлу упирался бы в исчерпанный лимит (находка Т-Н5).
   */
  describe('ограничение частоты запросов', () => {
    it('после лимита POST /orders отдаёт 429 и Retry-After', async () => {
      const send = () =>
        request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${throttledToken}`)
          .field('title', 'x');

      const statuses: number[] = [];

      for (let attempt = 0; attempt < 21; attempt += 1) {
        // Строго по очереди: параллельные запросы не дают воспроизводимого счёта.
        // oxlint-disable-next-line no-await-in-loop
        const response = await send();
        statuses.push(response.status);

        if (response.status === 429) {
          expect(response.headers['retry-after']).toBeDefined();
          expect(String(response.body.message)).toContain('Слишком много запросов');
        }
      }

      expect(statuses.slice(0, 20).every((status) => status === 400)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });
});
