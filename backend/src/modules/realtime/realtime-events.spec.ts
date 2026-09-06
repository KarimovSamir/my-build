import { describe, expect, it } from 'vitest';

import {
  NotificationType,
  OfferStatus,
  OrderStatus,
  socketEvents,
  socketRooms,
} from '@mybuild/shared';

import type { AppliedTransition } from '../orders/order-transition.service.js';
import {
  notificationsBroadcast,
  orderCreatedBroadcast,
  orderUpdateBroadcast,
  transitionBroadcast,
  type NotificationTarget,
  type RealtimeMessage,
} from './realtime-events.js';

/**
 * Адресация событий WebSocket (ТЗ §8).
 *
 * Проверяется здесь по той же причине, что и `order-view`: кому уходит
 * событие — это вопрос приватности §4.1, и ошибиться в нём молча очень легко.
 * На живой системе такую ошибку видно только со стороны лишнего получателя.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const WINNER_ID = '33333333-3333-4333-8333-333333333333';
const LOSER_ID = '44444444-4444-4444-8444-444444444444';
const OFFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RIVAL_OFFER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const orderRoom = socketRooms.order(ORDER_ID);
const clientRoom = socketRooms.user(CLIENT_ID);

/**
 * Заказ в результате перехода. Функции нужны из него два поля, поэтому
 * приведение одно и на месте — собирать строку Prisma целиком незачем.
 */
const order = { id: ORDER_ID, clientId: CLIENT_ID } as AppliedTransition['order'];

function notification(userId: string, type: NotificationType): NotificationTarget {
  return {
    id: `notification-${userId}`,
    userId,
    type,
    orderId: ORDER_ID,
    title: 'Заголовок',
    body: 'Текст уведомления',
    isRead: false,
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
}

function applied(overrides: Partial<AppliedTransition> = {}): AppliedTransition {
  return {
    order,
    offerId: OFFER_ID,
    companyId: WINNER_ID,
    fromStatus: OrderStatus.AWAITING_CONFIRMATION,
    nextStatus: OrderStatus.IN_PROGRESS,
    offerUpdates: [],
    notifications: [],
    ...overrides,
  };
}

/** Все сообщения одного события. */
function messagesOf(messages: RealtimeMessage[], event: string): RealtimeMessage[] {
  return messages.filter((message) => message.event === event);
}

describe('orderCreatedBroadcast', () => {
  it('уходит только в ленту компаний', () => {
    const { messages, evictions } = orderCreatedBroadcast(ORDER_ID);

    expect(evictions).toEqual([]);
    expect(messages).toEqual([
      {
        rooms: [socketRooms.companyFeed()],
        event: socketEvents.orderCreated,
        payload: { orderId: ORDER_ID },
      },
    ]);
  });
});

describe('transitionBroadcast', () => {
  it('смену статуса шлёт в комнату заказа и лично клиенту', () => {
    const { messages } = transitionBroadcast(applied());

    expect(messagesOf(messages, socketEvents.orderStatusChanged)).toEqual([
      {
        rooms: [orderRoom, clientRoom],
        event: socketEvents.orderStatusChanged,
        payload: { orderId: ORDER_ID },
      },
    ]);
  });

  it('без смены статуса события о ней нет', () => {
    // Второе предложение оставляет заказ в `AWAITING_CONFIRMATION` (ТЗ §4.1):
    // перехода не было, и рассказывать о нём нечего.
    const { messages } = transitionBroadcast(
      applied({
        fromStatus: OrderStatus.AWAITING_CONFIRMATION,
        nextStatus: OrderStatus.AWAITING_CONFIRMATION,
      }),
      { offerEvent: socketEvents.offerCreated },
    );

    expect(messagesOf(messages, socketEvents.orderStatusChanged)).toEqual([]);
    expect(messagesOf(messages, socketEvents.offerCreated)).toHaveLength(1);
  });

  it('различает создание и обновление предложения', () => {
    const created = transitionBroadcast(applied(), {
      offerEvent: socketEvents.offerCreated,
    });
    const updated = transitionBroadcast(applied(), {
      offerEvent: socketEvents.offerUpdated,
    });

    expect(messagesOf(created.messages, socketEvents.offerCreated)[0]).toEqual({
      rooms: [orderRoom, clientRoom],
      event: socketEvents.offerCreated,
      payload: { orderId: ORDER_ID, offerId: OFFER_ID },
    });
    expect(messagesOf(updated.messages, socketEvents.offerUpdated)).toHaveLength(1);
  });

  it('о статусе предложения сообщает его компании, а не всем подряд', () => {
    const { messages } = transitionBroadcast(
      applied({
        offerUpdates: [
          { offerId: OFFER_ID, companyId: WINNER_ID, status: OfferStatus.ACCEPTED },
          {
            offerId: RIVAL_OFFER_ID,
            companyId: LOSER_ID,
            status: OfferStatus.NOT_ACCEPTED,
          },
        ],
      }),
    );

    expect(messagesOf(messages, socketEvents.offerStatusChanged)).toEqual([
      {
        rooms: [orderRoom, socketRooms.user(WINNER_ID)],
        event: socketEvents.offerStatusChanged,
        payload: { orderId: ORDER_ID, offerId: OFFER_ID },
      },
      {
        rooms: [orderRoom, socketRooms.user(LOSER_ID)],
        event: socketEvents.offerStatusChanged,
        payload: { orderId: ORDER_ID, offerId: RIVAL_OFFER_ID },
      },
    ]);
  });

  it('выселяет из комнаты заказа тех, чьё предложение выбыло', () => {
    const { evictions } = transitionBroadcast(
      applied({
        offerUpdates: [
          { offerId: OFFER_ID, companyId: WINNER_ID, status: OfferStatus.ACCEPTED },
          {
            offerId: RIVAL_OFFER_ID,
            companyId: LOSER_ID,
            status: OfferStatus.NOT_ACCEPTED,
          },
        ],
      }),
    );

    // Исполнитель остаётся: он сторона сделки. Проигравшая компания видит
    // заказ снова как `WAITING` (ТЗ §4.1) — в комнате ей больше не место.
    expect(evictions).toEqual([
      { userRoom: socketRooms.user(LOSER_ID), orderRoom },
    ]);
  });

  it.each([OfferStatus.WITHDRAWN, OfferStatus.REJECTED, OfferStatus.NOT_ACCEPTED])(
    'статус предложения %s выводит компанию из комнаты заказа',
    (status) => {
      const { evictions } = transitionBroadcast(
        applied({
          offerUpdates: [{ offerId: OFFER_ID, companyId: LOSER_ID, status }],
        }),
      );

      expect(evictions).toHaveLength(1);
    },
  );

  it('уведомление уходит только своему адресату и несёт готовый DTO', () => {
    const { messages } = transitionBroadcast(
      applied({
        notifications: [
          notification(CLIENT_ID, NotificationType.OFFER_RECEIVED),
          notification(LOSER_ID, NotificationType.OFFER_NOT_ACCEPTED),
        ],
      }),
    );

    const created = messagesOf(messages, socketEvents.notificationCreated);

    expect(created.map((message) => message.rooms)).toEqual([
      [clientRoom],
      [socketRooms.user(LOSER_ID)],
    ]);
    expect(created[0]!.payload).toEqual({
      notification: {
        id: `notification-${CLIENT_ID}`,
        type: NotificationType.OFFER_RECEIVED,
        orderId: ORDER_ID,
        title: 'Заголовок',
        body: 'Текст уведомления',
        isRead: false,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    });
  });

  it('в событиях про заказ нет ничего, кроме идентификаторов', () => {
    // Рассылка уходит в комнату целиком, а видимый состав заказа у клиента
    // и у компании разный (ТЗ §4.1): статус или цена в нагрузке обошли бы
    // всю маскировку `order-view` одним событием.
    const { messages } = transitionBroadcast(
      applied({
        offerUpdates: [
          { offerId: OFFER_ID, companyId: WINNER_ID, status: OfferStatus.ACCEPTED },
        ],
      }),
      { offerEvent: socketEvents.offerUpdated },
    );

    for (const message of messages) {
      expect(Object.keys(message.payload)).not.toContain('status');
      expect(Object.keys(message.payload)).not.toContain('price');
    }
  });
});

describe('orderUpdateBroadcast', () => {
  it('файлы и площадь адресованы комнате заказа и клиенту', () => {
    const rows = [notification(CLIENT_ID, NotificationType.FILES_UPDATED)];

    const { messages } = orderUpdateBroadcast(
      socketEvents.orderFilesUpdated,
      { id: ORDER_ID, clientId: CLIENT_ID },
      rows,
    );

    expect(messages[0]).toEqual({
      rooms: [orderRoom, clientRoom],
      event: socketEvents.orderFilesUpdated,
      payload: { orderId: ORDER_ID },
    });
    expect(messages[1]!.event).toBe(socketEvents.notificationCreated);
  });
});

describe('notificationsBroadcast', () => {
  it('шлёт только уведомления: заказа, о котором говорить, уже нет', () => {
    const { messages } = notificationsBroadcast([
      notification(LOSER_ID, NotificationType.ORDER_DELETED),
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.event).toBe(socketEvents.notificationCreated);
    expect(messages[0]!.rooms).toEqual([socketRooms.user(LOSER_ID)]);
  });
});
