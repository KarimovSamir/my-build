/**
 * Обёртка над state-машиной: одна транзакция на один переход (ТЗ §4, §12.2).
 *
 * Разделение обязанностей такое: машина решает, *что* должно произойти,
 * а этот сервис — единственное место, где решение попадает в базу. Смена
 * статуса заказа, статусы предложений, цена сделки и уведомления пишутся
 * одним коммитом; частичного результата не бывает.
 *
 * Проверка прав здесь не делается: кто имеет право дёрнуть переход,
 * решают guard'ы на маршрутах (ТЗ §6).
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferStatus, OrderStatus } from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import type { Notification, Order } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  OrderEvent,
  OrderEventType,
  OrderSideEffect,
  OrderStateMachine,
} from './order-state-machine.js';

/**
 * Намерение вызывающего кода. Предложение для событий сдачи и приёмки
 * не передаётся: у заказа в работе исполнитель ровно один, и сервис
 * находит его сам — так его нельзя перепутать.
 */
export type OrderTransitionCommand =
  | { type: typeof OrderEventType.OFFER_SUBMITTED; orderId: string; offerId: string }
  | { type: typeof OrderEventType.OFFER_WITHDRAWN; orderId: string; offerId: string }
  | { type: typeof OrderEventType.OFFER_REJECTED; orderId: string; offerId: string }
  | { type: typeof OrderEventType.OFFER_ACCEPTED; orderId: string; offerId: string }
  | { type: typeof OrderEventType.WORK_SUBMITTED; orderId: string }
  | {
      type: typeof OrderEventType.WORK_CONFIRMED;
      orderId: string;
      completionComment?: string;
    }
  | {
      type: typeof OrderEventType.WORK_DISPUTED;
      orderId: string;
      correctionComment: string;
    };

/** Результат перехода. Из него Фаза 5 соберёт события WebSocket (ТЗ §8). */
export interface AppliedTransition {
  order: Order;
  offerId: string;
  companyId: string;
  fromStatus: OrderStatus;
  nextStatus: OrderStatus;
  notifications: Notification[];
}

/** Статусы предложения, в которых компания считается исполнителем заказа. */
const EXECUTING_OFFER_STATUSES: OfferStatus[] = [
  OfferStatus.ACCEPTED,
  OfferStatus.WORK_SUBMITTED,
  OfferStatus.BACK_FOR_OVERRIDE,
];

type OfferWithCompany = {
  id: string;
  companyId: string;
  proposedPrice: Prisma.Decimal;
  proposedDeadline: Date;
  company: { companyName: string | null };
};

@Injectable()
export class OrderTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machine: OrderStateMachine,
  ) {}

  async apply(command: OrderTransitionCommand): Promise<AppliedTransition> {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(tx, command.orderId);
        const offer = await this.resolveOffer(tx, order.id, command);
        const event = await this.buildEvent(tx, command, offer);

        const { fromStatus, nextStatus, effects } = this.machine.transition(
          {
            orderId: order.id,
            orderNumber: order.orderNumber,
            title: order.title,
            clientId: order.clientId,
            status: order.status,
          },
          event,
        );

        const { updatedOrder, notifications } = await this.applyEffects(
          tx,
          order.id,
          nextStatus,
          effects,
        );

        return {
          order: updatedOrder,
          offerId: offer.id,
          companyId: offer.companyId,
          fromStatus,
          nextStatus,
          notifications,
        };
      },
      {
        // Переход — это до девяти запросов подряд, и база managed, то есть
        // задержка сети умножается на девять. Дефолтные 5 секунд Prisma
        // при плохой связи истекают ещё до коммита, и переход падает
        // на ровном месте. Запас важнее пары секунд ожидания.
        timeout: 15_000,
        maxWait: 10_000,
      },
    );
  }

  /**
   * Взять заказ под блокировку строки до конца транзакции.
   *
   * Без этого два одновременных запроса (например, клиент принимает одно
   * предложение, а компания в тот же момент отзывает другое) прочитали бы
   * один и тот же статус и записали бы поверх друг друга. Prisma строчных
   * блокировок не умеет, поэтому FOR UPDATE идёт сырым запросом.
   */
  private async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Order> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundException('Заказ не найден');
    }

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  private async resolveOffer(
    tx: Prisma.TransactionClient,
    orderId: string,
    command: OrderTransitionCommand,
  ): Promise<OfferWithCompany> {
    const select = {
      id: true,
      companyId: true,
      proposedPrice: true,
      proposedDeadline: true,
      company: { select: { companyName: true } },
    } as const;

    const offer =
      'offerId' in command
        ? await tx.offer.findFirst({
            where: { id: command.offerId, orderId },
            select,
          })
        : await tx.offer.findFirst({
            where: { orderId, status: { in: EXECUTING_OFFER_STATUSES } },
            select,
          });

    if (!offer) {
      throw 'offerId' in command
        ? new NotFoundException('Предложение не найдено')
        : new ConflictException('У заказа нет компании-исполнителя');
    }

    return offer;
  }

  private async buildEvent(
    tx: Prisma.TransactionClient,
    command: OrderTransitionCommand,
    offer: OfferWithCompany,
  ): Promise<OrderEvent> {
    const ref = { offerId: offer.id, companyId: offer.companyId };

    switch (command.type) {
      case OrderEventType.OFFER_SUBMITTED:
        return {
          type: command.type,
          ...ref,
          companyName: offer.company.companyName ?? 'Компания',
        };

      case OrderEventType.OFFER_WITHDRAWN:
      case OrderEventType.OFFER_REJECTED:
        return {
          type: command.type,
          ...ref,
          otherActiveOffers: await tx.offer.count({
            where: {
              orderId: command.orderId,
              status: OfferStatus.SENT,
              id: { not: offer.id },
            },
          }),
        };

      case OrderEventType.OFFER_ACCEPTED:
        return {
          type: command.type,
          ...ref,
          // Decimal не переживает JSON без потерь, поэтому цена везде строка.
          proposedPrice: offer.proposedPrice.toString(),
          proposedDeadline: offer.proposedDeadline,
        };

      case OrderEventType.WORK_SUBMITTED:
        return { type: command.type, ...ref };

      case OrderEventType.WORK_CONFIRMED:
        return {
          type: command.type,
          ...ref,
          completionComment: command.completionComment,
        };

      case OrderEventType.WORK_DISPUTED:
        return {
          type: command.type,
          ...ref,
          correctionComment: command.correctionComment,
        };
    }
  }

  private async applyEffects(
    tx: Prisma.TransactionClient,
    orderId: string,
    nextStatus: OrderStatus,
    effects: OrderSideEffect[],
  ): Promise<{ updatedOrder: Order; notifications: Notification[] }> {
    const orderData: Prisma.OrderUpdateInput = { status: nextStatus };
    const notificationsToCreate: Prisma.NotificationCreateManyInput[] = [];

    // Каждый переход касается ровно одного предложения — того, по которому
    // пришло событие. Поэтому здесь одно поле, а не список.
    let offerStatusUpdate: { offerId: string; status: OfferStatus } | null = null;
    let declineOthersExcept: string | null = null;

    // Сначала разбираем эффекты, потом пишем: так в цикле нет запросов
    // и порядок обращений к базе виден целиком.
    for (const effect of effects) {
      switch (effect.kind) {
        case 'SET_OFFER_STATUS':
          offerStatusUpdate = { offerId: effect.offerId, status: effect.status };
          break;

        case 'DECLINE_OTHER_OFFERS':
          declineOthersExcept = effect.acceptedOfferId;
          break;

        case 'SET_ORDER_DEAL':
          orderData.price = effect.price;
          orderData.deadline = effect.deadline;
          break;

        case 'SET_CORRECTION_COMMENT':
          orderData.correctionComment = effect.comment;
          break;

        case 'SET_COMPLETION_COMMENT':
          orderData.clientCompletionComment = effect.comment;
          break;

        case 'CREATE_NOTIFICATION':
          notificationsToCreate.push({
            userId: effect.userId,
            type: effect.type,
            orderId,
            title: effect.title,
            body: effect.body,
          });
          break;
      }
    }

    if (offerStatusUpdate) {
      await tx.offer.update({
        where: { id: offerStatusUpdate.offerId },
        data: { status: offerStatusUpdate.status },
      });
    }

    if (declineOthersExcept) {
      await tx.offer.updateMany({
        where: { orderId, id: { not: declineOthersExcept }, status: OfferStatus.SENT },
        data: { status: OfferStatus.NOT_ACCEPTED },
      });
    }

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: orderData,
    });

    // Уведомления пишутся здесь же, а не отдельным вызовом после коммита:
    // иначе смена статуса могла бы пройти без уведомления (ТЗ §8).
    const notifications = notificationsToCreate.length
      ? await tx.notification.createManyAndReturn({ data: notificationsToCreate })
      : [];

    return { updatedOrder, notifications };
  }
}
