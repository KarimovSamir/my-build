/**
 * `OrderGateway` — WebSocket-шлюз на Socket.io (ТЗ §8).
 *
 * Отвечает ровно за две вещи: кого пускать в сокет и кого пускать в комнату.
 * Что именно рассылать, решает `RealtimeService` по чистым функциям
 * из `realtime-events.ts`, а сюда приходит уже готовый список сообщений.
 *
 * Авторизация — тем же `SupabaseJwtService`, что и REST (ТЗ §8): токен
 * приходит в handshake (`auth.token`), проверяется по JWKS, и неавторизованный
 * сокет до `connection` не доходит вовсе. Срок токена соединение тоже не
 * переживает: по `exp` шлюз закрывает сокет сам, иначе одно рукопожатие давало
 * бы доступ к событиям на часы вперёд, тогда как REST с тем же токеном уже
 * отвечал бы 401 (ТЗ §6).
 *
 * Частота сообщений ограничена тем же скользящим окном, что и REST
 * (`common/rate-window.ts`, ТЗ §6): `ThrottleGuard` работает в HTTP-контексте
 * и до сокета не достаёт, а `subscribe:order` ходит в базу на каждое
 * сообщение.
 *
 * Любой обработчик обязан ответить ack — в том числе когда падает. Без ответа
 * клиент остаётся вне комнаты и не узнаёт об этом: сокет жив, событий нет,
 * страница выглядит рабочей.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import {
  ACTIVE_OFFER_STATUSES,
  Role,
  WS_NAMESPACE,
  socketEvents,
  socketMessages,
  socketRooms,
  type SubscribeAck,
} from '@mybuild/shared';

import { RateWindows, type RateWindowOptions } from '../../common/rate-window.js';
import { isUuid } from '../../common/uuid.js';
import { parseCorsOrigins } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { InvalidTokenError, SupabaseJwtService } from '../auth/supabase-jwt.service.js';
import type { RealtimeMessage, RoomEviction } from './realtime-events.js';

/** Списки статусов в `shared/` объявлены `readonly`, а Prisma ждёт изменяемый. */
const ACTIVE_OFFER_STATUS_LIST = [...ACTIVE_OFFER_STATUSES];

const NO_TOKEN = 'Требуется авторизация';
const EMAIL_NOT_VERIFIED = 'Подтвердите email: ссылка отправлена на вашу почту';

const ORDER_FORBIDDEN = 'Заказ не найден';
const FEED_FORBIDDEN = 'Лента заказов доступна только компаниям';
const TOO_MANY_MESSAGES = 'Слишком много сообщений, попробуйте ещё раз';
const SUBSCRIBE_FAILED = 'Не удалось подписаться на обновления';

/**
 * Сколько сообщений принимать от одного сокета (ТЗ §6).
 *
 * Сообщения шлёт не пользователь, а переходы между страницами: вход в комнату
 * и выход из неё. Даже быстрый перебор разделов не даёт и десятка за десять
 * секунд, так что запас здесь большой, а поток «в цикле» упрётся сразу.
 */
const MESSAGE_RATE: RateWindowOptions = { limit: 30, ttl: 10_000 };

/** Пользователь, привязанный к сокету после проверки токена. */
interface SocketData {
  user?: AuthUser;
  /**
   * Момент, после которого токен недействителен (ТЗ §6).
   *
   * Рукопожатие проверяет токен один раз, а соединение живёт часами: без срока
   * вкладка получала бы события ещё долго после того, как REST начал отвечать
   * 401 тем же токеном.
   */
  expiresAt?: number | null;
  /** Таймер, закрывающий сокет в этот момент. Снимается при отключении. */
  expiryTimer?: ReturnType<typeof setTimeout>;
}

type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * Разрешённые origin'ы сокета. Заполняются при создании шлюза, до первого
 * подключения: раньше их взять неоткуда — опции декоратора вычисляются при
 * загрузке модуля, когда `.env` ещё не разобран.
 */
let allowedOrigins: string[] = [];

/**
 * CORS для сокета настраивается отдельно от HTTP: `app.enableCors` до
 * socket.io не относится. Список тот же, что у REST, и берётся так же — из
 * `CORS_ORIGINS` через `ConfigService`, а не из `process.env` напрямую:
 * незаданная переменная там означала бы пустой список и молчаливый отказ
 * всем браузерам, тогда как проверка окружения на старте подставляет
 * значение по умолчанию.
 */
function corsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  // Заголовка нет у не-браузерных клиентов (тесты, серверные подписчики) —
  // запрещать им нечего: CORS защищает чужую вкладку, а не сервер.
  if (!origin) {
    callback(null, true);
    return;
  }

  callback(null, allowedOrigins.includes(origin));
}

@WebSocketGateway({ namespace: WS_NAMESPACE, cors: { origin: corsOrigin } })
export class OrderGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(OrderGateway.name);

  /** Частота сообщений — на сокет, а не на пользователя: вкладок может быть много. */
  private readonly messageRate = new RateWindows();

  @WebSocketServer()
  private readonly namespace?: Namespace;

  constructor(
    private readonly jwt: SupabaseJwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Список origin'ов кладётся в модульную переменную, потому что читает его
    // функция из опций декоратора: до экземпляра шлюза ей не дотянуться.
    allowedOrigins = parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGINS'));
  }

  /**
   * Проверка токена — middleware namespace'а, а не `handleConnection`:
   * так отказ доезжает до клиента как `connect_error` с внятной причиной,
   * а событие `connection` для неавторизованного сокета не наступает вовсе.
   */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticate(socket as AppSocket).then(
        () => next(),
        (error: unknown) => next(error instanceof Error ? error : new Error(NO_TOKEN)),
      );
    });
  }

  /**
   * Личная комната — сразу: уведомления приходят в неё без всякой подписки.
   *
   * Вход в комнату ожидается, а не запускается фоном: адаптер может отвечать
   * не мгновенно, и сообщение, пришедшее раньше, обработалось бы у сокета вне
   * своей комнаты. Не удалось войти — соединение закрывается: сокет без личной
   * комнаты выглядит рабочим, но не получает ни одного уведомления.
   *
   * `@ConnectedSocket()` здесь нет: это lifecycle-хук, а не обработчик
   * сообщения, и декораторы параметров Nest в нём не разбирает.
   */
  async handleConnection(socket: AppSocket): Promise<void> {
    const user = socket.data.user;

    if (!user) {
      // Сюда попасть нельзя: middleware выше не пропускает сокет без пользователя.
      socket.disconnect(true);
      return;
    }

    this.scheduleExpiry(socket);

    try {
      await socket.join(socketRooms.user(user.id));
    } catch (error) {
      this.logger.error(
        `Не удалось войти в личную комнату пользователя ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      clearExpiry(socket);
      socket.disconnect(true);
    }
  }

  /** Сокет закрылся — снять таймер: держать его до `exp` уже не за чем. */
  handleDisconnect(socket: AppSocket): void {
    clearExpiry(socket);
    // Окно частоты живёт на идентификатор сокета, а он больше не повторится.
    this.messageRate.forget(socket.id);
  }

  /**
   * Подписка на комнату заказа. Пускаем только участников: клиента заказа
   * и компанию с активным предложением (ТЗ §8, §4.1).
   *
   * Компании без предложения тут делать нечего, хотя карточку заказа она
   * открыть может: ей заказ показывается как `WAITING`, а в комнату идут
   * события о настоящем движении.
   */
  @SubscribeMessage(socketMessages.subscribeOrder)
  async subscribeOrder(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    return this.handle(socket, socketMessages.subscribeOrder, async () => {
      const user = this.activeUser(socket);
      const orderId = readOrderId(body);

      if (!user || !orderId || !(await this.isOrderParticipant(user.id, orderId))) {
        return { ok: false, error: ORDER_FORBIDDEN };
      }

      await socket.join(socketRooms.order(orderId));
      return { ok: true };
    });
  }

  @SubscribeMessage(socketMessages.unsubscribeOrder)
  async unsubscribeOrder(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    return this.handle(socket, socketMessages.unsubscribeOrder, async () => {
      const orderId = readOrderId(body);

      if (orderId) {
        await socket.leave(socketRooms.order(orderId));
      }

      return { ok: true };
    });
  }

  /** Лента доступных заказов — только компаниям (ТЗ §8). */
  @SubscribeMessage(socketMessages.subscribeFeed)
  async subscribeFeed(@ConnectedSocket() socket: AppSocket): Promise<SubscribeAck> {
    return this.handle(socket, socketMessages.subscribeFeed, async () => {
      if (this.activeUser(socket)?.role !== Role.COMPANY) {
        return { ok: false, error: FEED_FORBIDDEN };
      }

      await socket.join(socketRooms.companyFeed());
      return { ok: true };
    });
  }

  @SubscribeMessage(socketMessages.unsubscribeFeed)
  async unsubscribeFeed(@ConnectedSocket() socket: AppSocket): Promise<SubscribeAck> {
    return this.handle(socket, socketMessages.unsubscribeFeed, async () => {
      await socket.leave(socketRooms.companyFeed());
      return { ok: true };
    });
  }

  /**
   * Разослать готовые сообщения. Комнат у сообщения может быть несколько —
   * socket.io сам не отправит одно событие дважды тому, кто состоит в обеих.
   *
   * `exceptSocketId` — сокет вкладки, которая это действие и выполнила
   * (`common/actor-context.ts`). Ей событие не нужно: ответ маршрута уже принёс
   * ей свежий заказ, а перечит по своему же событию — лишний запрос. Уведомлений
   * это не касается: они несут готовый текст для колокольчика, и единственное
   * событие с данными должно доезжать в любом случае.
   */
  emit(messages: RealtimeMessage[], exceptSocketId?: string | null): void {
    const namespace = this.namespace;

    if (!namespace) {
      // Шлюз не поднят: так бывает только в тестах, где приложение собрано
      // без сокетов. Молчать нельзя, падать — тем более.
      this.logger.warn(`Шлюз не инициализирован, событий не отправлено: ${messages.length}`);
      return;
    }

    for (const message of messages) {
      const actor =
        message.event === socketEvents.notificationCreated ? null : (exceptSocketId ?? null);

      const target = actor === null ? namespace : namespace.except(actor);

      target.to(message.rooms).emit(message.event, message.payload);
    }
  }

  /**
   * Выставить из комнаты заказа тех, кто перестал быть его участником.
   * Идёт до рассылки: иначе выбывшая компания получит событие о заказе,
   * который для неё уже чужой.
   */
  evict(evictions: RoomEviction[]): void {
    const namespace = this.namespace;

    if (!namespace) return;

    for (const eviction of evictions) {
      namespace.in(eviction.members).socketsLeave(eviction.room);
    }
  }

  /**
   * Общая обёртка обработчиков сообщений: лимит частоты и ответ при любом
   * исходе.
   *
   * Ответ обязателен, потому что клиент ждёт ack. Глобальный
   * `AllExceptionsFilter` в контексте `ws` не действует, и упавший обработчик
   * без этой обёртки отправлял бы клиенту `exception`, а колбэк подписки
   * не вызывал бы вовсе: страница осталась бы вне комнаты и молча перестала
   * получать события.
   *
   * Отказ помечается `retryable`: лимит и сбой базы проходят сами, и клиент
   * повторит попытку, а «не пустили» повтором не исправить.
   */
  private async handle(
    socket: AppSocket,
    message: string,
    run: () => Promise<SubscribeAck>,
  ): Promise<SubscribeAck> {
    const allowed = this.messageRate.hit(`${socket.id}:${message}`, MESSAGE_RATE);

    if (!allowed.allowed) {
      return { ok: false, error: TOO_MANY_MESSAGES, retryable: true };
    }

    try {
      return await run();
    } catch (error) {
      this.logger.error(
        `Сообщение ${message} не обработано`,
        error instanceof Error ? error.stack : String(error),
      );

      return { ok: false, error: SUBSCRIBE_FAILED, retryable: true };
    }
  }

  /**
   * Пользователь сокета, если токен ещё действителен.
   *
   * Срок проверяется и здесь, а не только таймером: таймер — основной механизм
   * (события шлёт сервер, ждать сообщения от клиента нельзя), а эта проверка
   * закрывает разрыв, если сообщение и срабатывание таймера разошлись.
   */
  private activeUser(socket: AppSocket): AuthUser | null {
    const { user, expiresAt } = socket.data;

    if (!user) return null;

    if (typeof expiresAt === 'number' && expiresAt <= Date.now()) {
      socket.disconnect(true);
      return null;
    }

    return user;
  }

  /**
   * Закрыть сокет, когда истечёт токен (ТЗ §6).
   *
   * Клиент после этого переподключается уже с обновлённым токеном: функция
   * `auth` в `frontend/src/lib/socket.ts` спрашивает его заново на каждую
   * попытку. Если сессии больше нет, откажет рукопожатие — и повторов не будет.
   */
  private scheduleExpiry(socket: AppSocket): void {
    const expiresAt = socket.data.expiresAt;

    clearExpiry(socket);

    if (typeof expiresAt !== 'number') return;

    // Рукопожатие уже отвергло просроченный токен, так что остаток
    // положительный; `max` — защита от рассинхронизации часов, а не от `exp`
    // в прошлом.
    socket.data.expiryTimer = setTimeout(
      () => {
        socket.data.expiryTimer = undefined;
        socket.disconnect(true);
      },
      Math.max(expiresAt - Date.now(), 0),
    );
  }

  /** Токен из handshake → пользователь на сокете. Иначе — ошибка подключения. */
  private async authenticate(socket: AppSocket): Promise<void> {
    const token = readHandshakeToken(socket);

    if (!token) {
      throw new Error(NO_TOKEN);
    }

    let user: AuthUser;
    let expiresAt: number | null;

    try {
      ({ user, expiresAt } = await this.jwt.verifyToken(token));
    } catch (error) {
      // Наружу уходит только текст: socket.io отдаёт клиенту `message`
      // ошибки как есть, а причина остаётся в `cause` — для логов.
      throw new Error(error instanceof InvalidTokenError ? error.message : NO_TOKEN, {
        cause: error,
      });
    }

    // То же правило, что в `SupabaseAuthGuard`: до подтверждения email
    // кабинет закрыт целиком, включая real-time.
    if (!user.emailVerified) {
      throw new Error(EMAIL_NOT_VERIFIED);
    }

    socket.data.user = user;
    socket.data.expiresAt = expiresAt;
  }

  /**
   * Участник заказа — клиент либо компания с активным предложением.
   *
   * Проверяется по базе, а не по токену: связь с заказом в токене не записана,
   * и та же причина, по которой `OwnershipGuard` ходит в базу.
   */
  private async isOrderParticipant(userId: string, orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { clientId: userId },
          {
            offers: {
              some: { companyId: userId, status: { in: ACTIVE_OFFER_STATUS_LIST } },
            },
          },
        ],
      },
      select: { id: true },
    });

    return order !== null;
  }
}

/** Снять таймер истечения токена, если он был поставлен. */
function clearExpiry(socket: AppSocket): void {
  if (socket.data.expiryTimer === undefined) return;

  clearTimeout(socket.data.expiryTimer);
  socket.data.expiryTimer = undefined;
}

/**
 * Токен подключения. Основное место — `auth.token` (ТЗ §8); заголовок
 * читается тоже, потому что не всякий клиент умеет класть данные в handshake.
 */
function readHandshakeToken(socket: AppSocket): string | null {
  const fromAuth: unknown = socket.handshake.auth?.token;

  if (typeof fromAuth === 'string' && fromAuth.length > 0) {
    return fromAuth;
  }

  const header = socket.handshake.headers.authorization;
  const [scheme, value, ...rest] = (header ?? '').split(' ');

  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value;
}

/**
 * Идентификатор заказа из тела сообщения.
 *
 * Разбирается вручную: тело сообщения приходит от клиента и типов не имеет,
 * а колонка `Order.id` — `uuid`, и мусор в ней упал бы уже в Postgres.
 */
function readOrderId(body: unknown): string | null {
  const value: unknown = (body as { orderId?: unknown } | null)?.orderId;

  return typeof value === 'string' && isUuid(value) ? value : null;
}
