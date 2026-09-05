import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FileOwnerType,
  NotificationType,
  ObjectType,
  OfferStatus,
  OrderCategory,
  OrderStatus,
  Role,
} from '@mybuild/shared';

import { FilesService } from '../src/modules/files/files.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';
import { pdfBytes, pngBytes } from './support/uploads.js';

/**
 * Полный цикл сделки на живой базе (DoD подфазы 4.2): клиент принимает
 * предложение, компания загружает файлы и сдаёт работу, клиент отправляет
 * на доработку, компания пересдаёт, клиент подтверждает.
 *
 * Переходы сами по себе покрыты unit-тестами машины и
 * `order-transition.e2e-spec.ts`. Здесь проверяется, что до них доходит
 * настоящий HTTP-запрос с multipart, что файлы версионируются по сдачам
 * и что маршруты закрыты по ролям и участию в заказе.
 *
 * Бакет должен существовать: `npm run storage:setup -w backend`.
 */

/** Свой набор пользователей: уборка не заденет фикстуры соседних файлов. */
const users = e2eSuite('workflow');

const PDF = pdfBytes('чертёж первой сдачи');
const PNG = pngBytes('фото объекта');

describe('Сделка и приёмка (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let files: FilesService;

  let client: E2eUser;
  let executor: E2eUser;
  let rival: E2eUser;

  let clientToken: string;
  let executorToken: string;
  let rivalToken: string;

  const orderIds: string[] = [];

  /** Заказ, ждущий выбора, с предложениями обеих компаний. */
  async function seedOrderWithOffers(title: string) {
    const order = await prisma.order.create({
      data: {
        clientId: client.id,
        title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Описание работ для проверки полного цикла',
        address: 'Москва, ул. Тестовая, 7',
        squareMeters: 100,
        clientBudget: '150000.00',
        status: OrderStatus.AWAITING_CONFIRMATION,
        offers: {
          create: [
            {
              companyId: executor.id,
              status: OfferStatus.SENT,
              proposedPrice: '140000.00',
              proposedDeadline: new Date('2027-05-01T00:00:00.000Z'),
              comment: 'Возьмёмся',
            },
            {
              companyId: rival.id,
              status: OfferStatus.SENT,
              proposedPrice: '155000.00',
              proposedDeadline: new Date('2027-06-01T00:00:00.000Z'),
            },
          ],
        },
      },
      include: { offers: true },
    });

    orderIds.push(order.id);

    return {
      order,
      executorOfferId: order.offers.find((offer) => offer.companyId === executor.id)!.id,
      rivalOfferId: order.offers.find((offer) => offer.companyId === rival.id)!.id,
    };
  }

  /** Заказ, уже находящийся в работе у `executor`. */
  async function seedOrderInProgress(title: string) {
    const { order, executorOfferId } = await seedOrderWithOffers(title);

    await prisma.$transaction([
      prisma.offer.update({
        where: { id: executorOfferId },
        data: { status: OfferStatus.ACCEPTED },
      }),
      prisma.offer.updateMany({
        where: { orderId: order.id, status: OfferStatus.SENT },
        data: { status: OfferStatus.NOT_ACCEPTED },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.IN_PROGRESS,
          price: '140000.00',
          deadline: new Date('2027-05-01T00:00:00.000Z'),
        },
      }),
    ]);

    return { orderId: order.id, executorOfferId };
  }

  /** Загрузка файлов сдачи: multipart, как из браузера. */
  function postFiles(token: string, orderId: string, comment: string, count = 1) {
    const upload = request(app.getHttpServer())
      .post(`/orders/${orderId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .field('comment', comment);

    upload.attach('files', PDF, {
      filename: 'Чертёж.pdf',
      contentType: 'application/pdf',
    });

    if (count > 1) {
      upload.attach('files', PNG, { filename: 'photo.png', contentType: 'image/png' });
    }

    return upload;
  }

  function post(token: string, path: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function orderRow(orderId: string) {
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  beforeAll(async () => {
    await users.dropUsers();

    [client, executor, rival] = await Promise.all([
      users.createUser('workflow-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('workflow-executor', {
        role: Role.COMPANY,
        companyName: 'ООО «Исполнитель»',
      }),
      users.createUser('workflow-rival', {
        role: Role.COMPANY,
        companyName: 'ООО «Конкурент»',
      }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    files = app.get(FilesService);

    [clientToken, executorToken, rivalToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(executor),
      signInE2eUser(rival),
    ]);
  });

  afterAll(async () => {
    // Каскад уносит строки OrderFile и OrderSubmission, но не объекты в бакете.
    await Promise.all(
      orderIds.map((id) => files.removeStorageObjectsForOrder(id).catch(() => undefined)),
    );
    await app?.close();
    await users.dropUsers();
  });

  describe('POST /orders/:id/accept-offer/:offerId', () => {
    it('переводит заказ в работу, фиксирует цену и отклоняет остальных', async () => {
      const { order, executorOfferId, rivalOfferId } =
        await seedOrderWithOffers('Ремонт под ключ');

      const response = await post(
        clientToken,
        `/orders/${order.id}/accept-offer/${executorOfferId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: OrderStatus.IN_PROGRESS,
        price: '140000',
        deadline: '2027-05-01T00:00:00.000Z',
        contractorName: 'ООО «Исполнитель»',
      });

      const offers = await prisma.offer.findMany({ where: { orderId: order.id } });
      expect(offers.find((offer) => offer.id === executorOfferId)?.status).toBe(
        OfferStatus.ACCEPTED,
      );
      expect(offers.find((offer) => offer.id === rivalOfferId)?.status).toBe(
        OfferStatus.NOT_ACCEPTED,
      );

      // Уведомления получают обе компании: выбранная и проигравшая (ТЗ §8).
      const notifications = await prisma.notification.findMany({
        where: { orderId: order.id },
      });
      expect(notifications).toHaveLength(2);
      expect(
        notifications.map((item) => `${item.userId}:${item.type}`).toSorted(),
      ).toEqual(
        [
          `${executor.id}:${NotificationType.OFFER_ACCEPTED}`,
          // Проигравшей — «не выбрано»: её предложение никто не отклонял.
          `${rival.id}:${NotificationType.OFFER_NOT_ACCEPTED}`,
        ].toSorted(),
      );
    });

    it('не даёт компании принять предложение за клиента', async () => {
      const { order, executorOfferId } = await seedOrderWithOffers('Чужое решение');

      const response = await post(
        executorToken,
        `/orders/${order.id}/accept-offer/${executorOfferId}`,
      );

      expect(response.status).toBe(403);
      expect(await orderRow(order.id).then((row) => row.status)).toBe(
        OrderStatus.AWAITING_CONFIRMATION,
      );
    });

    it('на предложение от другого заказа отдаёт 404', async () => {
      const first = await seedOrderWithOffers('Первый заказ');
      const second = await seedOrderWithOffers('Второй заказ');

      const response = await post(
        clientToken,
        `/orders/${first.order.id}/accept-offer/${second.executorOfferId}`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /orders/:id/files', () => {
    it('заводит первую сдачу и версионирует файлы по её номеру', async () => {
      const { orderId } = await seedOrderInProgress('Сдача файлов');

      const response = await postFiles(executorToken, orderId, 'Первый этап готов', 2);

      expect(response.status).toBe(200);
      expect(response.body.submissions).toEqual([
        expect.objectContaining({ round: 1, comment: 'Первый этап готов', submittedAt: null }),
      ]);
      // Статус от загрузки не меняется: работа считается сданной после /submit.
      expect(response.body.status).toBe(OrderStatus.IN_PROGRESS);

      const stored = await prisma.orderFile.findMany({
        where: { orderId, ownerType: FileOwnerType.COMPANY },
      });
      expect(stored).toHaveLength(2);
      expect(stored.every((file) => file.submissionRound === 1)).toBe(true);

      const notification = await prisma.notification.findFirst({
        where: { orderId, type: NotificationType.FILES_UPDATED },
      });
      expect(notification?.userId).toBe(client.id);
    });

    it('дописывает файлы в ту же сдачу и обновляет комментарий', async () => {
      const { orderId } = await seedOrderInProgress('Дозагрузка');

      await postFiles(executorToken, orderId, 'Черновик');
      const second = await postFiles(executorToken, orderId, 'Добавил фото', 2);

      expect(second.status).toBe(200);
      expect(second.body.submissions).toHaveLength(1);
      expect(second.body.submissions[0]).toMatchObject({
        round: 1,
        comment: 'Добавил фото',
      });

      // Одинаковый PDF во второй раз не сохраняется: дедупликация в пределах
      // сдачи (ТЗ §4.1). Новым оказывается только PNG.
      expect(
        await prisma.orderFile.count({
          where: { orderId, ownerType: FileOwnerType.COMPANY },
        }),
      ).toBe(2);
    });

    /**
     * Повторная отправка тех же файлов ничего не добавляет (дедупликация
     * по SHA-256 в пределах сдачи, ТЗ §4.1), и уведомления клиенту тоже быть
     * не должно: в заказе не изменилось ничего, кроме комментария.
     */
    it('на дубликаты не заводит ни строк, ни второго уведомления', async () => {
      const { orderId } = await seedOrderInProgress('Дубликаты');

      await postFiles(executorToken, orderId, 'Первая загрузка');
      const again = await postFiles(executorToken, orderId, 'Те же файлы');

      expect(again.status).toBe(200);
      expect(
        await prisma.orderFile.count({
          where: { orderId, ownerType: FileOwnerType.COMPANY },
        }),
      ).toBe(1);
      expect(
        await prisma.notification.count({
          where: { orderId, type: NotificationType.FILES_UPDATED },
        }),
      ).toBe(1);
      // Комментарий описывает сдачу целиком и заменяется в любом случае.
      expect(again.body.submissions[0]).toMatchObject({ comment: 'Те же файлы' });
    });

    it('требует комментарий', async () => {
      const { orderId } = await seedOrderInProgress('Без комментария');

      const response = await request(app.getHttpServer())
        .post(`/orders/${orderId}/files`)
        .set('Authorization', `Bearer ${executorToken}`)
        .attach('files', PDF, { filename: 'Чертёж.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(await prisma.orderSubmission.count({ where: { orderId } })).toBe(0);
    });

    it('требует хотя бы один файл', async () => {
      const { orderId } = await seedOrderInProgress('Без файлов');

      const response = await request(app.getHttpServer())
        .post(`/orders/${orderId}/files`)
        .set('Authorization', `Bearer ${executorToken}`)
        .field('comment', 'Забыл приложить');

      expect(response.status).toBe(400);
    });

    it('не пускает компанию, которая не исполнитель', async () => {
      const { orderId } = await seedOrderInProgress('Чужая сдача');

      const response = await postFiles(rivalToken, orderId, 'Мы тоже поработали');

      expect(response.status).toBe(404);
    });

    it('не пускает клиента: файлы сдачи грузит исполнитель', async () => {
      const { orderId } = await seedOrderInProgress('Клиент грузит сдачу');

      const response = await postFiles(clientToken, orderId, 'Мои файлы');

      expect(response.status).toBe(403);
    });
  });

  describe('POST /orders/:id/submit', () => {
    it('сдаёт работу и закрывает сдачу', async () => {
      const { orderId } = await seedOrderInProgress('Сдача работы');
      await postFiles(executorToken, orderId, 'Готово');

      const response = await post(executorToken, `/orders/${orderId}/submit`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(OrderStatus.AWAITING_COMPLETION_CONFIRMATION);
      expect(response.body.submissions[0].submittedAt).not.toBeNull();

      const offer = await prisma.offer.findFirstOrThrow({
        where: { orderId, companyId: executor.id },
      });
      expect(offer.status).toBe(OfferStatus.WORK_SUBMITTED);
    });

    it('не даёт сдать работу, пока ничего не загружено', async () => {
      const { orderId } = await seedOrderInProgress('Пустая сдача');

      const response = await post(executorToken, `/orders/${orderId}/submit`);

      expect(response.status).toBe(409);
      expect(await orderRow(orderId).then((row) => row.status)).toBe(
        OrderStatus.IN_PROGRESS,
      );
    });

    it('не даёт сдать работу дважды', async () => {
      const { orderId } = await seedOrderInProgress('Повторная сдача');
      await postFiles(executorToken, orderId, 'Готово');
      await post(executorToken, `/orders/${orderId}/submit`);

      const again = await post(executorToken, `/orders/${orderId}/submit`);

      expect(again.status).toBe(409);
    });

    it('после сдачи файлы в закрытый раунд не дописываются', async () => {
      const { orderId } = await seedOrderInProgress('Дозагрузка после сдачи');
      await postFiles(executorToken, orderId, 'Готово');
      await post(executorToken, `/orders/${orderId}/submit`);

      const response = await postFiles(executorToken, orderId, 'Ещё один файл', 2);

      expect(response.status).toBe(409);
    });
  });

  describe('PATCH /orders/:id/verified-area', () => {
    function patchArea(token: string, orderId: string, value: unknown) {
      return request(app.getHttpServer())
        .patch(`/orders/${orderId}/verified-area`)
        .set('Authorization', `Bearer ${token}`)
        .send({ verifiedSquareMeters: value });
    }

    it('уточняет площадь, не меняя ни статус, ни цену, ни площадь клиента', async () => {
      const { orderId } = await seedOrderInProgress('Уточнение площади');

      const response = await patchArea(executorToken, orderId, 98.5);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: OrderStatus.IN_PROGRESS,
        price: '140000',
        squareMeters: 100,
        verifiedSquareMeters: 98.5,
      });

      const notification = await prisma.notification.findFirst({
        where: { orderId, type: NotificationType.AREA_VERIFIED },
      });
      expect(notification?.userId).toBe(client.id);
    });

    it('на то же значение второго уведомления не создаёт', async () => {
      // Сохранение прежнего числа — не уточнение: событие, которого не было,
      // в ленте клиента появиться не должно (ТЗ §8).
      const { orderId } = await seedOrderInProgress('Площадь без изменений');

      await patchArea(executorToken, orderId, 98.5);
      const again = await patchArea(executorToken, orderId, 98.5);

      expect(again.status).toBe(200);
      expect(again.body.verifiedSquareMeters).toBe(98.5);
      expect(
        await prisma.notification.count({
          where: { orderId, type: NotificationType.AREA_VERIFIED },
        }),
      ).toBe(1);
    });

    it('отклоняет площадь меньше нуля', async () => {
      const { orderId } = await seedOrderInProgress('Отрицательная площадь');

      expect((await patchArea(executorToken, orderId, -1)).status).toBe(400);
      expect((await patchArea(executorToken, orderId, 0)).status).toBe(400);
    });

    it('не пускает клиента', async () => {
      const { orderId } = await seedOrderInProgress('Клиент уточняет площадь');

      expect((await patchArea(clientToken, orderId, 90)).status).toBe(403);
    });

    it('запрещена на завершённом заказе', async () => {
      const { orderId } = await seedOrderInProgress('Завершённый заказ');
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED },
      });
      await prisma.offer.updateMany({
        where: { orderId, companyId: executor.id },
        data: { status: OfferStatus.COMPLETED },
      });

      expect((await patchArea(executorToken, orderId, 90)).status).toBe(409);
    });
  });

  describe('Полный цикл до COMPLETED', () => {
    it('проходит доработку и завершается подтверждением клиента', async () => {
      const { orderId } = await seedOrderInProgress('Полный цикл');

      await postFiles(executorToken, orderId, 'Первая версия проекта');
      const submitted = await post(executorToken, `/orders/${orderId}/submit`);
      expect(submitted.status).toBe(200);

      const disputed = await post(clientToken, `/orders/${orderId}/dispute`, {
        correctionComment: 'Перенести перегородку',
      });
      expect(disputed.status).toBe(200);
      expect(disputed.body).toMatchObject({
        status: OrderStatus.COMPLETION_DISPUTED,
        correctionComment: 'Перенести перегородку',
      });

      // Пересдача идёт вторым раундом: файлы первой сдачи остаются на месте —
      // это ровно те файлы, по которым шёл спор (ТЗ §4.1).
      const reupload = await postFiles(executorToken, orderId, 'Перегородку перенесли', 2);
      expect(reupload.status).toBe(200);
      expect(reupload.body.submissions.map((item: { round: number }) => item.round)).toEqual([
        1, 2,
      ]);

      const rounds = await prisma.orderFile.findMany({
        where: { orderId, ownerType: FileOwnerType.COMPANY },
        select: { submissionRound: true },
      });
      expect(rounds.filter((file) => file.submissionRound === 1)).toHaveLength(1);
      expect(rounds.filter((file) => file.submissionRound === 2)).toHaveLength(2);

      expect((await post(executorToken, `/orders/${orderId}/submit`)).status).toBe(200);

      const confirmed = await post(clientToken, `/orders/${orderId}/confirm`, {
        comment: 'Работа принята',
      });

      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toMatchObject({
        status: OrderStatus.COMPLETED,
        clientCompletionComment: 'Работа принята',
      });

      const offer = await prisma.offer.findFirstOrThrow({
        where: { orderId, companyId: executor.id },
      });
      expect(offer.status).toBe(OfferStatus.COMPLETED);

      const submissions = await prisma.orderSubmission.findMany({
        where: { orderId },
        orderBy: { round: 'asc' },
      });
      expect(submissions).toHaveLength(2);
      expect(submissions.every((row) => row.submittedAt !== null)).toBe(true);
    });

    it('доработка требует комментарий', async () => {
      const { orderId } = await seedOrderInProgress('Доработка без текста');
      await postFiles(executorToken, orderId, 'Готово');
      await post(executorToken, `/orders/${orderId}/submit`);

      const response = await post(clientToken, `/orders/${orderId}/dispute`, {
        correctionComment: '   ',
      });

      expect(response.status).toBe(400);
    });

    it('подтвердить работу может только клиент заказа', async () => {
      const { orderId } = await seedOrderInProgress('Чужое подтверждение');
      await postFiles(executorToken, orderId, 'Готово');
      await post(executorToken, `/orders/${orderId}/submit`);

      expect((await post(executorToken, `/orders/${orderId}/confirm`)).status).toBe(403);
      expect(await orderRow(orderId).then((row) => row.status)).toBe(
        OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
      );
    });

    it('подтверждение заказа, который ещё в работе, отдаёт 409', async () => {
      const { orderId } = await seedOrderInProgress('Раннее подтверждение');

      expect((await post(clientToken, `/orders/${orderId}/confirm`)).status).toBe(409);
    });

    /**
     * У завершённого заказа исполнитель остаётся, поэтому повторное действие
     * обязано упереться в таблицу переходов. Ответ «у заказа нет
     * компании-исполнителя» здесь был бы просто неправдой.
     */
    it('по завершённому заказу действия отвечают запрещённым переходом', async () => {
      const { orderId } = await seedOrderInProgress('Действия после завершения');
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED },
      });
      await prisma.offer.updateMany({
        where: { orderId, companyId: executor.id },
        data: { status: OfferStatus.COMPLETED },
      });

      const confirmed = await post(clientToken, `/orders/${orderId}/confirm`);
      expect(confirmed.status).toBe(409);
      expect(confirmed.body.error).toBe('InvalidStateTransition');

      const submitted = await post(executorToken, `/orders/${orderId}/submit`);
      expect(submitted.status).toBe(409);
      expect(submitted.body.error).toBe('InvalidStateTransition');
    });
  });

  describe('Приватность сдач (ТЗ §4.1)', () => {
    it('посторонняя компания не видит ни файлов, ни сдач', async () => {
      const { orderId } = await seedOrderInProgress('Приватность сдач');
      await postFiles(executorToken, orderId, 'Внутренние документы');

      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${rivalToken}`);

      expect(response.status).toBe(200);
      expect(response.body.submissions).toEqual([]);
      expect(response.body.files).toEqual([]);
      // Проигравшая компания видит заказ как ждущий исполнителя (ТЗ §4.1).
      expect(response.body.status).toBe(OrderStatus.WAITING);
    });

    it('клиент видит сдачи со своим комментарием исполнителя', async () => {
      const { orderId } = await seedOrderInProgress('Сдачи глазами клиента');
      await postFiles(executorToken, orderId, 'Смета и чертежи');

      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.submissions).toEqual([
        expect.objectContaining({ round: 1, comment: 'Смета и чертежи' }),
      ]);
    });
  });
});
