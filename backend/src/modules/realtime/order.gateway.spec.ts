import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Namespace } from 'socket.io';

import { ACTIVE_OFFER_STATUSES, Role, socketRooms } from '@mybuild/shared';

import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  InvalidTokenError,
  type SupabaseJwtService,
} from '../auth/supabase-jwt.service.js';
import { OrderGateway } from './order.gateway.js';

/**
 * Шлюз: кого пускать в сокет и кого пускать в комнату (ТЗ §8).
 *
 * Живого socket.io здесь нет — проверяется решение, а не транспорт. Что
 * подключение по сети действительно отклоняется, проверяет
 * `test/realtime.e2e-spec.ts`.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

const client: AuthUser = {
  id: CLIENT_ID,
  email: 'client@mybuild.test',
  emailVerified: true,
  role: Role.CLIENT,
};

/** Час жизни токена — столько же, сколько отводит Supabase. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Данные, которые шлюз держит на сокете. */
interface SocketStubData {
  user?: AuthUser;
  expiresAt?: number | null;
  expiryTimer?: ReturnType<typeof setTimeout>;
}

/** Сокет в том объёме, в каком его трогает шлюз. */
function createSocket(user?: AuthUser, token?: string, expiresAt?: number | null) {
  return {
    handshake: {
      auth: token === undefined ? {} : { token },
      headers: {} as Record<string, string | undefined>,
    },
    data: { user, expiresAt } as SocketStubData,
    join: vi.fn(async (_room: string) => undefined),
    leave: vi.fn(async (_room: string) => undefined),
    disconnect: vi.fn((_close?: boolean) => undefined),
  };
}

type SocketStub = ReturnType<typeof createSocket>;

/** Сокет в том виде, в каком его ждёт шлюз: тип берётся у него же. */
type GatewaySocket = Parameters<OrderGateway['handleConnection']>[0];

function asSocket(socket: SocketStub): GatewaySocket {
  return socket as unknown as GatewaySocket;
}

function createStubs(
  options: { participant?: boolean; user?: AuthUser; expiresAt?: number | null } = {},
) {
  const jwt = {
    verifyToken: vi.fn(async (_token: string) => ({
      user: options.user ?? client,
      expiresAt:
        options.expiresAt === undefined ? Date.now() + TOKEN_TTL_MS : options.expiresAt,
    })),
  };

  const prisma = {
    order: {
      findFirst: vi.fn(async (_args: { where: Record<string, unknown> }) =>
        options.participant === false ? null : { id: ORDER_ID },
      ),
    },
  };

  const gateway = new OrderGateway(
    jwt as unknown as SupabaseJwtService,
    prisma as unknown as PrismaService,
  );

  return { gateway, jwt, prisma };
}

/**
 * Шлюз получает namespace от Nest уже после создания. В тесте его надо
 * подставить руками — поле объявлено `readonly` именно потому, что писать
 * в него больше некому.
 */
function withNamespace(gateway: OrderGateway) {
  const namespace = {
    to: vi.fn((_rooms: string[]) => ({ emit: emit })),
    in: vi.fn((_room: string) => ({ socketsLeave })),
    use: vi.fn((_middleware: unknown) => undefined),
  };

  const emit = vi.fn((_event: string, _payload: unknown) => undefined);
  const socketsLeave = vi.fn((_room: string) => undefined);

  Reflect.set(gateway, 'namespace', namespace);

  return { namespace, emit, socketsLeave };
}

/**
 * Запустить middleware авторизации и дождаться его решения.
 * `undefined` — сокет пропущен, иначе — причина отказа.
 */
async function authenticate(
  gateway: OrderGateway,
  socket: SocketStub,
): Promise<string | undefined> {
  const use = vi.fn((_middleware: unknown) => undefined);
  gateway.afterInit({ use } as unknown as Namespace);

  const middleware = use.mock.calls[0]![0] as (
    socket: GatewaySocket,
    next: (error?: Error) => void,
  ) => void;

  return new Promise<string | undefined>((resolve) => {
    middleware(asSocket(socket), (error) => resolve(error?.message));
  });
}

describe('OrderGateway: авторизация сокета', () => {
  it('пускает с действительным токеном и запоминает пользователя', async () => {
    const { gateway, jwt } = createStubs();
    const socket = createSocket(undefined, 'token');

    expect(await authenticate(gateway, socket)).toBeUndefined();
    expect(jwt.verifyToken).toHaveBeenCalledWith('token');
    expect(socket.data.user).toEqual(client);
    // Срок токена запоминается вместе с пользователем: по нему шлюз закроет
    // соединение, когда токен истечёт (ТЗ §6).
    expect(socket.data.expiresAt).toBeTypeOf('number');
  });

  it('отклоняет сокет без токена, не спрашивая Supabase', async () => {
    const { gateway, jwt } = createStubs();

    expect(await authenticate(gateway, createSocket())).toBe('Требуется авторизация');
    expect(jwt.verifyToken).not.toHaveBeenCalled();
  });

  it('читает токен и из заголовка: не всякий клиент кладёт его в handshake', async () => {
    const { gateway, jwt } = createStubs();
    const socket = createSocket();
    socket.handshake.headers.authorization = 'Bearer header-token';

    expect(await authenticate(gateway, socket)).toBeUndefined();
    expect(jwt.verifyToken).toHaveBeenCalledWith('header-token');
  });

  it('передаёт наружу причину отказа проверки токена', async () => {
    const { gateway, jwt } = createStubs();
    jwt.verifyToken.mockRejectedValueOnce(
      new InvalidTokenError('Токен недействителен или истёк'),
    );

    expect(await authenticate(gateway, createSocket(undefined, 'stale'))).toBe(
      'Токен недействителен или истёк',
    );
  });

  it('не пускает с неподтверждённым email — как и REST', async () => {
    const { gateway } = createStubs({
      user: { ...client, emailVerified: false },
    });

    expect(await authenticate(gateway, createSocket(undefined, 'token'))).toContain(
      'Подтвердите email',
    );
  });
});

describe('OrderGateway: срок действия токена', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('закрывает сокет, когда токен истекает', async () => {
    const { gateway } = createStubs();
    const socket = createSocket(undefined, 'token');

    await authenticate(gateway, socket);
    gateway.handleConnection(asSocket(socket));

    // До срока соединение живёт: рвать его раньше времени значило бы
    // выключать real-time у работающего пользователя.
    vi.advanceTimersByTime(TOKEN_TTL_MS - 1_000);
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('на отключении снимает таймер', async () => {
    const { gateway } = createStubs();
    const socket = createSocket(undefined, 'token');

    await authenticate(gateway, socket);
    gateway.handleConnection(asSocket(socket));
    gateway.handleDisconnect(asSocket(socket));

    vi.advanceTimersByTime(TOKEN_TTL_MS * 2);

    // Сокета уже нет, и оставшийся таймер держал бы ссылку на него до `exp`.
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.expiryTimer).toBeUndefined();
  });

  it('сообщение с истёкшим токеном не выполняет и рвёт соединение', async () => {
    const { gateway, prisma } = createStubs();
    const socket = createSocket(client, undefined, Date.now() - 1);

    await expect(
      gateway.subscribeOrder(asSocket(socket), { orderId: ORDER_ID }),
    ).resolves.toMatchObject({ ok: false });

    // REST с таким токеном отвечает 401 — сокет обязан вести себя так же.
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('ленту с истёкшим токеном не открывает даже компании', async () => {
    const { gateway } = createStubs();
    const socket = createSocket(
      { ...client, id: COMPANY_ID, role: Role.COMPANY },
      undefined,
      Date.now() - 1,
    );

    await expect(gateway.subscribeFeed(asSocket(socket))).resolves.toMatchObject({
      ok: false,
    });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});

describe('OrderGateway: комнаты', () => {
  it('на подключении заводит личную комнату', () => {
    const { gateway } = createStubs();
    const socket = createSocket(client);

    gateway.handleConnection(asSocket(socket));

    expect(socket.join).toHaveBeenCalledWith(socketRooms.user(CLIENT_ID));
  });

  it('в комнату заказа пускает участника', async () => {
    const { gateway, prisma } = createStubs();
    const socket = createSocket(client);

    await expect(
      gateway.subscribeOrder(asSocket(socket), { orderId: ORDER_ID }),
    ).resolves.toEqual({ ok: true });

    expect(socket.join).toHaveBeenCalledWith(socketRooms.order(ORDER_ID));
    // Участие — это клиент заказа либо компания с активным предложением
    // (ТЗ §4.1): отозванное и проигравшее в комнату не пускают.
    expect(prisma.order.findFirst.mock.calls[0]![0].where).toEqual({
      id: ORDER_ID,
      OR: [
        { clientId: CLIENT_ID },
        {
          offers: {
            some: { companyId: CLIENT_ID, status: { in: [...ACTIVE_OFFER_STATUSES] } },
          },
        },
      ],
    });
  });

  it('постороннему отвечает отказом и в комнату не пускает', async () => {
    const { gateway } = createStubs({ participant: false });
    const socket = createSocket(client);

    await expect(
      gateway.subscribeOrder(asSocket(socket), { orderId: ORDER_ID }),
    ).resolves.toEqual({ ok: false, error: 'Заказ не найден' });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('мусор вместо идентификатора не доходит до базы', async () => {
    const { gateway, prisma } = createStubs();

    await expect(
      gateway.subscribeOrder(asSocket(createSocket(client)), { orderId: 'не uuid' }),
    ).resolves.toMatchObject({ ok: false });

    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('ленту заказов открывает только компаниям', async () => {
    const { gateway } = createStubs();
    const clientSocket = createSocket(client);
    const companySocket = createSocket({
      ...client,
      id: COMPANY_ID,
      role: Role.COMPANY,
    });

    await expect(gateway.subscribeFeed(asSocket(clientSocket))).resolves.toMatchObject({
      ok: false,
    });
    expect(clientSocket.join).not.toHaveBeenCalled();

    await expect(gateway.subscribeFeed(asSocket(companySocket))).resolves.toEqual({
      ok: true,
    });
    expect(companySocket.join).toHaveBeenCalledWith(socketRooms.companyFeed());
  });

  it('отписка выводит из комнаты', async () => {
    const { gateway } = createStubs();
    const socket = createSocket(client);

    await gateway.unsubscribeOrder(asSocket(socket), { orderId: ORDER_ID });
    await gateway.unsubscribeFeed(asSocket(socket));

    expect(socket.leave).toHaveBeenNthCalledWith(1, socketRooms.order(ORDER_ID));
    expect(socket.leave).toHaveBeenNthCalledWith(2, socketRooms.companyFeed());
  });
});

describe('OrderGateway: рассылка', () => {
  let gateway: OrderGateway;

  beforeEach(() => {
    gateway = createStubs().gateway;
  });

  it('шлёт сообщение сразу во все его комнаты', () => {
    const { namespace, emit } = withNamespace(gateway);

    gateway.emit([
      {
        rooms: ['order:1', 'user:2'],
        event: 'order:status_changed',
        payload: { orderId: ORDER_ID },
      },
    ]);

    // Комнаты передаются одним вызовом: socket.io сам не отправит событие
    // дважды тому, кто состоит в обеих.
    expect(namespace.to).toHaveBeenCalledWith(['order:1', 'user:2']);
    expect(emit).toHaveBeenCalledWith('order:status_changed', { orderId: ORDER_ID });
  });

  it('выселяет сокеты пользователя из комнаты заказа', () => {
    const { namespace, socketsLeave } = withNamespace(gateway);

    gateway.evict([{ userRoom: 'user:2', orderRoom: 'order:1' }]);

    expect(namespace.in).toHaveBeenCalledWith('user:2');
    expect(socketsLeave).toHaveBeenCalledWith('order:1');
  });

  it('без поднятого шлюза не падает', () => {
    // Так бывает в тестах, где приложение собрано без сокетов: действие уже
    // записано в базу, и ронять ответ API из-за рассылки нельзя.
    expect(() =>
      gateway.emit([
        { rooms: ['user:2'], event: 'order:status_changed', payload: { orderId: ORDER_ID } },
      ]),
    ).not.toThrow();
    expect(() => gateway.evict([{ userRoom: 'user:2', orderRoom: 'order:1' }])).not.toThrow();
  });
});
