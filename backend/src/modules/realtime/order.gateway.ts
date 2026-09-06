/**
 * `OrderGateway` — WebSocket-шлюз на Socket.io (ТЗ §8).
 *
 * Отвечает ровно за две вещи: кого пускать в сокет и кого пускать в комнату.
 * Что именно рассылать, решает `RealtimeService` по чистым функциям
 * из `realtime-events.ts`, а сюда приходит уже готовый список сообщений.
 *
 * Авторизация — тем же `SupabaseJwtService`, что и REST (ТЗ §8): токен
 * приходит в handshake (`auth.token`), проверяется по JWKS, и неавторизованный
 * сокет до `connection` не доходит вовсе.
 */

import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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
  socketMessages,
  socketRooms,
  type SubscribeAck,
} from '@mybuild/shared';

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

/** Пользователь, привязанный к сокету после проверки токена. */
interface SocketData {
  user?: AuthUser;
}

type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * CORS для сокета настраивается отдельно от HTTP: `app.enableCors` до
 * socket.io не относится. Список тот же — из `CORS_ORIGINS`, но читается
 * при каждом подключении: декоратор вычисляется при загрузке модуля, когда
 * `.env` ещё не разобран.
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

  callback(null, parseCorsOrigins(process.env.CORS_ORIGINS ?? '').includes(origin));
}

@WebSocketGateway({ namespace: WS_NAMESPACE, cors: { origin: corsOrigin } })
export class OrderGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(OrderGateway.name);

  @WebSocketServer()
  private readonly namespace?: Namespace;

  constructor(
    private readonly jwt: SupabaseJwtService,
    private readonly prisma: PrismaService,
  ) {}

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

  /** Личная комната — сразу: уведомления приходят в неё без всякой подписки. */
  handleConnection(@ConnectedSocket() socket: AppSocket): void {
    const user = socket.data.user;

    if (!user) {
      // Сюда попасть нельзя: middleware выше не пропускает сокет без пользователя.
      socket.disconnect(true);
      return;
    }

    void socket.join(socketRooms.user(user.id));
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
    const user = socket.data.user;
    const orderId = readOrderId(body);

    if (!user || !orderId || !(await this.isOrderParticipant(user.id, orderId))) {
      return { ok: false, error: ORDER_FORBIDDEN };
    }

    await socket.join(socketRooms.order(orderId));
    return { ok: true };
  }

  @SubscribeMessage(socketMessages.unsubscribeOrder)
  async unsubscribeOrder(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    const orderId = readOrderId(body);

    if (orderId) {
      await socket.leave(socketRooms.order(orderId));
    }

    return { ok: true };
  }

  /** Лента доступных заказов — только компаниям (ТЗ §8). */
  @SubscribeMessage(socketMessages.subscribeFeed)
  async subscribeFeed(@ConnectedSocket() socket: AppSocket): Promise<SubscribeAck> {
    if (socket.data.user?.role !== Role.COMPANY) {
      return { ok: false, error: FEED_FORBIDDEN };
    }

    await socket.join(socketRooms.companyFeed());
    return { ok: true };
  }

  @SubscribeMessage(socketMessages.unsubscribeFeed)
  async unsubscribeFeed(@ConnectedSocket() socket: AppSocket): Promise<SubscribeAck> {
    await socket.leave(socketRooms.companyFeed());
    return { ok: true };
  }

  /**
   * Разослать готовые сообщения. Комнат у сообщения может быть несколько —
   * socket.io сам не отправит одно событие дважды тому, кто состоит в обеих.
   */
  emit(messages: RealtimeMessage[]): void {
    const namespace = this.namespace;

    if (!namespace) {
      // Шлюз не поднят: так бывает только в тестах, где приложение собрано
      // без сокетов. Молчать нельзя, падать — тем более.
      this.logger.warn(`Шлюз не инициализирован, событий не отправлено: ${messages.length}`);
      return;
    }

    for (const message of messages) {
      namespace.to(message.rooms).emit(message.event, message.payload);
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
      namespace.in(eviction.userRoom).socketsLeave(eviction.orderRoom);
    }
  }

  /** Токен из handshake → пользователь на сокете. Иначе — ошибка подключения. */
  private async authenticate(socket: AppSocket): Promise<void> {
    const token = readHandshakeToken(socket);

    if (!token) {
      throw new Error(NO_TOKEN);
    }

    let user: AuthUser;

    try {
      user = await this.jwt.verify(token);
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
