import 'dotenv/config';

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ObjectType,
  OrderCategory,
  OrderStatus,
  Role,
  WS_NAMESPACE,
  socketEvents,
  socketMessages,
  type NotificationEventPayload,
  type OfferEventPayload,
  type OrderEventPayload,
  type SubscribeAck,
} from '@mybuild/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { e2eSuite, signInE2eUser, type E2eUser } from './support/e2e-users.js';

/**
 * WebSocket-шлюз на живом сервере (DoD подфазы 5.2).
 *
 * Здесь проверяется то, чего не видно в unit-тестах шлюза: что сокет реально
 * подключается по сети, что неавторизованное подключение отклоняется до
 * `connect`, и что события доезжают до подписчика после настоящего запроса
 * к API. Приложение поднимается через `listen`, а не `init`: без слушающего
 * порта socket.io подключить некуда.
 */

const users = e2eSuite('realtime');

/** Сколько ждём событие, прежде чем считать, что оно не пришло. */
const EVENT_TIMEOUT_MS = 10_000;

function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Дождаться подключения. Возвращает текст ошибки, если сокет отклонён. */
function waitForConnect(socket: Socket): Promise<string | null> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve(null));
    socket.once('connect_error', (error: Error) => resolve(error.message));
  });
}

/** Первое событие с таким именем или `null`, если его не было. */
function nextEvent<T>(socket: Socket, event: string): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), EVENT_TIMEOUT_MS);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Убедиться, что событие **не** приходит. Ждём заметно меньше: здесь
 * ожидание — это чистая задержка теста, а не время доставки.
 */
function noEvent(socket: Socket, event: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), 1_500);

    socket.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Все события с таким именем за короткое окно. Нужны там, где проверяется
 * не «пришло ли», а «что именно пришло и ничего сверх того».
 */
function collectEvents<T>(socket: Socket, event: string): Promise<T[]> {
  const seen: T[] = [];

  socket.on(event, (payload: T) => seen.push(payload));

  return new Promise((resolve) => {
    setTimeout(() => {
      socket.off(event);
      resolve(seen);
    }, 1_500);
  });
}

function subscribeOrder(socket: Socket, orderId: string): Promise<SubscribeAck> {
  return socket.emitWithAck(socketMessages.subscribeOrder, { orderId });
}

describe('WebSocket-шлюз (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let wsUrl: string;

  let client: E2eUser;
  let winner: E2eUser;
  let loser: E2eUser;

  let clientToken: string;
  let winnerToken: string;
  let loserToken: string;

  /** Сокеты, открытые тестом: закрываются после каждого прогона. */
  const sockets: Socket[] = [];

  function connect(token: string | undefined): Socket {
    const socket = io(wsUrl, {
      transports: ['websocket'],
      auth: token === undefined ? {} : { token },
      // Переподключение мешает тестам отказа: сокет молча пробовал бы снова.
      reconnection: false,
      forceNew: true,
    });

    sockets.push(socket);
    return socket;
  }

  async function connected(token: string): Promise<Socket> {
    const socket = connect(token);
    expect(await waitForConnect(socket)).toBeNull();
    return socket;
  }

  function seedOrder(title: string) {
    return prisma.order.create({
      data: {
        clientId: client.id,
        title,
        category: OrderCategory.PLAN_IMPLEMENTATION,
        objectType: ObjectType.APARTMENT,
        description: 'Описание работ для проверки real-time',
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

  beforeAll(async () => {
    await users.dropUsers();

    [client, winner, loser] = await Promise.all([
      users.createUser('rt-client', { role: Role.CLIENT, firstName: 'Анна' }),
      users.createUser('rt-winner', {
        role: Role.COMPANY,
        companyName: 'ООО «Победа»',
      }),
      users.createUser('rt-loser', {
        role: Role.COMPANY,
        companyName: 'ООО «Второй»',
      }),
    ]);

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);

    // Порт 0 — свободный: тесты не должны конфликтовать с запущенным dev-сервером.
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}${WS_NAMESPACE}`;

    prisma = app.get(PrismaService);

    [clientToken, winnerToken, loserToken] = await Promise.all([
      signInE2eUser(client),
      signInE2eUser(winner),
      signInE2eUser(loser),
    ]);
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }

    await app?.close();
    await users.dropUsers();
  });

  describe('авторизация подключения', () => {
    it('без токена не подключает', async () => {
      expect(await waitForConnect(connect(undefined))).toBe('Требуется авторизация');
    });

    it('с мусорным токеном не подключает', async () => {
      expect(await waitForConnect(connect('не-токен'))).toBe(
        'Токен недействителен или истёк',
      );
    });

    it('с настоящим токеном подключает', async () => {
      const socket = connect(clientToken);

      expect(await waitForConnect(socket)).toBeNull();
      expect(socket.connected).toBe(true);
    });
  });

  describe('комнаты', () => {
    it('клиента пускает в комнату своего заказа', async () => {
      const order = await seedOrder('Комната клиента');
      const socket = await connected(clientToken);

      await expect(subscribeOrder(socket, order.id)).resolves.toEqual({ ok: true });
    });

    it('компанию без предложения в комнату заказа не пускает', async () => {
      const order = await seedOrder('Комната для чужих');
      const socket = await connected(winnerToken);

      // Карточку заказа компания открыть может, но там ей отдаётся
      // замаскированный `WAITING` (ТЗ §4.1). В комнате идёт настоящее движение.
      await expect(subscribeOrder(socket, order.id)).resolves.toMatchObject({
        ok: false,
      });
    });

    it('ленту заказов открывает компании и не открывает клиенту', async () => {
      const companySocket = await connected(winnerToken);
      const clientSocket = await connected(clientToken);

      await expect(
        companySocket.emitWithAck(socketMessages.subscribeFeed, {}),
      ).resolves.toEqual({ ok: true });
      await expect(
        clientSocket.emitWithAck(socketMessages.subscribeFeed, {}),
      ).resolves.toMatchObject({ ok: false });
    });
  });

  describe('события', () => {
    it('новый заказ приходит в ленту компаний', async () => {
      const socket = await connected(winnerToken);
      await socket.emitWithAck(socketMessages.subscribeFeed, {});

      const event = nextEvent<OrderEventPayload>(socket, socketEvents.orderCreated);

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .field('title', 'Заказ из ленты')
        .field('category', OrderCategory.PLAN_CREATION)
        .field('objectType', ObjectType.HOUSE)
        .field('description', 'Проект дома для проверки события order:created')
        .field('address', 'Казань, ул. Проверочная, 2')
        .field('squareMeters', '80');

      expect(response.status).toBe(201);
      expect(await event).toEqual({ orderId: response.body.id });
    });

    it('клиенту приходят и предложение, и уведомление о нём', async () => {
      const order = await seedOrder('Предложение в эфире');
      const socket = await connected(clientToken);
      await subscribeOrder(socket, order.id);

      const offerCreated = nextEvent<OrderEventPayload>(
        socket,
        socketEvents.offerCreated,
      );
      const notified = nextEvent<NotificationEventPayload>(
        socket,
        socketEvents.notificationCreated,
      );

      expect((await postOffer(winnerToken, order.id)).status).toBe(201);

      expect(await offerCreated).toMatchObject({ orderId: order.id });
      // Уведомление приходит с готовым текстом: колокольчику (5.4) не нужен
      // второй запрос, чтобы что-то показать.
      expect((await notified)?.notification.title).toBe('Новое предложение');
    });

    it('смена статуса доходит до комнаты заказа', async () => {
      const order = await seedOrder('Смена статуса');
      const socket = await connected(clientToken);
      await subscribeOrder(socket, order.id);

      const statusChanged = nextEvent<OrderEventPayload>(
        socket,
        socketEvents.orderStatusChanged,
      );

      await postOffer(winnerToken, order.id);

      // `WAITING` → `AWAITING_CONFIRMATION` (ТЗ §4). Статуса в событии нет:
      // видимый статус у клиента и у компании разный, а рассылка одна.
      expect(await statusChanged).toEqual({ orderId: order.id });
    });

    it('проигравшую компанию выводит из комнаты заказа', async () => {
      const order = await seedOrder('Выбор исполнителя');

      const winnerOffer = await postOffer(winnerToken, order.id);
      await postOffer(loserToken, order.id);

      const [loserSocket, winnerSocket] = await Promise.all([
        connected(loserToken),
        connected(winnerToken),
      ]);

      // Обе компании в комнате: у обеих активное предложение.
      await expect(subscribeOrder(loserSocket, order.id)).resolves.toEqual({ ok: true });
      await expect(subscribeOrder(winnerSocket, order.id)).resolves.toEqual({ ok: true });

      const rejected = nextEvent<OrderEventPayload>(
        loserSocket,
        socketEvents.offerStatusChanged,
      );
      const silent = noEvent(loserSocket, socketEvents.orderStatusChanged);
      const winnerSees = nextEvent<OrderEventPayload>(
        winnerSocket,
        socketEvents.orderStatusChanged,
      );
      const winnerOfferEvents = collectEvents<OfferEventPayload>(
        winnerSocket,
        socketEvents.offerStatusChanged,
      );

      const accepted = await request(app.getHttpServer())
        .post(`/orders/${order.id}/accept-offer/${winnerOffer.body.id}`)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(accepted.status).toBe(200);

      // Про своё предложение проигравшая узнать обязана — это её комната.
      expect(await rejected).toMatchObject({ orderId: order.id });

      // А про уход заказа в работу — уже нет: предложение выбыло, и заказ
      // снова выглядит для неё как `WAITING` (ТЗ §4.1). Выселение из комнаты
      // происходит до рассылки именно поэтому.
      expect(await silent).toBe(true);

      // Комната при этом рабочая: исполнитель то же событие получил.
      expect(await winnerSees).toEqual({ orderId: order.id });

      // А вот про чужие предложения победитель не узнаёт ничего, хотя и остаётся
      // в комнате заказа: события про предложение адресуются поимённо, иначе
      // по ним читались бы и число конкурентов, и их идентификаторы (ТЗ §4.1).
      expect((await winnerOfferEvents).map((event) => event.offerId)).toEqual([
        winnerOffer.body.id,
      ]);
    });
  });
});

/**
 * Срок действия токена на сокете (ТЗ §6).
 *
 * Проверка токена делается один раз, в рукопожатии, а соединение живёт часами —
 * значит, закрыть его по `exp` обязан сам шлюз. Ждать настоящий час здесь
 * нельзя, поэтому приложение поднимается с подставной проверкой токена: она
 * выдаёт тот же результат, что настоящая, но с коротким сроком.
 */
describe('WebSocket-шлюз: истечение токена (e2e)', () => {
  /** Сколько «живёт» токен в этом наборе. */
  const TOKEN_TTL_MS = 1_500;

  const user = {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'ttl@mybuild.test',
    emailVerified: true,
    role: Role.CLIENT,
  };

  let app: INestApplication;
  let wsUrl: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');
    const { SupabaseJwtService } = await import(
      '../src/modules/auth/supabase-jwt.service.js'
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseJwtService)
      .useValue({
        verify: () => Promise.resolve(user),
        verifyToken: () =>
          Promise.resolve({ user, expiresAt: Date.now() + TOKEN_TTL_MS }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}${WS_NAMESPACE}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('закрывает соединение по истечении токена, и подключиться заново можно', async () => {
    const socket = io(wsUrl, {
      transports: ['websocket'],
      auth: { token: 'подставной' },
      // Переподключение ручное: после закрытия сервером socket.io сам его
      // не делает — и на этом построено поведение `RealtimeProvider`.
      reconnection: false,
      forceNew: true,
    });

    expect(await waitForConnect(socket)).toBeNull();

    const reason = await new Promise<string>((resolve) => {
      socket.once('disconnect', resolve);
    });

    // Именно эту причину клиент отличает от обычного обрыва: он берёт свежий
    // токен и подключается заново (`frontend/src/components/realtime`).
    expect(reason).toBe('io server disconnect');

    socket.connect();
    expect(await waitForConnect(socket)).toBeNull();

    socket.disconnect();
  });
});
