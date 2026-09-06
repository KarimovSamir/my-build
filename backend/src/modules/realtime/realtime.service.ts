/**
 * Единая точка отправки событий WebSocket (ТЗ §8).
 *
 * Сервисы вызывают её после того, как транзакция закоммичена: событие,
 * отправленное изнутри транзакции, ушло бы и в случае отката — клиент
 * перечитал бы заказ и увидел прежнее состояние.
 *
 * Ошибка рассылки не должна ломать ответ API: действие уже записано в базу,
 * а уведомление о нём лежит там же и придёт с ближайшим запросом. Поэтому
 * всё, что здесь происходит, обёрнуто в try/catch с записью в лог.
 */

import { Injectable, Logger } from '@nestjs/common';
import { socketEvents } from '@mybuild/shared';

import type { AppliedTransition } from '../orders/order-transition.service.js';
import { OrderGateway } from './order.gateway.js';
import {
  notificationsBroadcast,
  orderCreatedBroadcast,
  orderUpdateBroadcast,
  transitionBroadcast,
  type NotificationTarget,
  type RealtimeBroadcast,
} from './realtime-events.js';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: OrderGateway) {}

  /** Новый заказ — в ленту компаний (ТЗ §8). */
  orderCreated(orderId: string): void {
    this.dispatch(orderCreatedBroadcast(orderId));
  }

  /**
   * Переход состояния заказа.
   *
   * `offerExisted` есть только у отправки предложения: по ТЗ §4.1 это upsert,
   * и различить `offer:created` и `offer:updated` может только вызывающий код —
   * по тому, была ли строка предложения до запроса.
   */
  transitionApplied(applied: AppliedTransition, offerExisted?: boolean): void {
    const offerEvent =
      offerExisted === undefined
        ? undefined
        : offerExisted
          ? socketEvents.offerUpdated
          : socketEvents.offerCreated;

    this.dispatch(transitionBroadcast(applied, { offerEvent }));
  }

  /** Компания добавила файлы сдачи (ТЗ §8). Статус заказа при этом не меняется. */
  orderFilesUpdated(
    order: { id: string; clientId: string },
    notifications: NotificationTarget[],
  ): void {
    this.dispatch(
      orderUpdateBroadcast(socketEvents.orderFilesUpdated, order, notifications),
    );
  }

  /** Компания уточнила площадь (ТЗ §8). */
  orderAreaVerified(
    order: { id: string; clientId: string },
    notifications: NotificationTarget[],
  ): void {
    this.dispatch(
      orderUpdateBroadcast(socketEvents.orderAreaVerified, order, notifications),
    );
  }

  /**
   * Только уведомления: так уходит `ORDER_DELETED`. Событий про заказ нет —
   * заказа больше нет, и комнаты у него тоже.
   */
  notificationsCreated(notifications: NotificationTarget[]): void {
    this.dispatch(notificationsBroadcast(notifications));
  }

  private dispatch(broadcast: RealtimeBroadcast): void {
    if (broadcast.messages.length === 0 && broadcast.evictions.length === 0) {
      return;
    }

    try {
      // Выселения строго до рассылки: см. `realtime-events.ts`.
      this.gateway.evict(broadcast.evictions);
      this.gateway.emit(broadcast.messages);
    } catch (error) {
      this.logger.error(
        'Не удалось разослать события WebSocket',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
