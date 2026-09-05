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
import { EXECUTOR_OFFER_STATUSES, OfferStatus, OrderStatus } from '@mybuild/shared';

import { isUuid } from '../../common/uuid.js';
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
  | {
      type: typeof OrderEventType.OFFER_SUBMITTED;
      orderId: string;
      offerId: string;
      /**
       * Статус предложения **до** того, как вызывающий код его записал;
       * `null` — предложение создаётся этим же запросом.
       *
       * Поле обязательное и читается вместо статуса из базы намеренно.
       * Отправка предложения по ТЗ §4.1 — upsert, то есть к моменту вызова
       * строка уже переписана в `SENT`, и проверка предусловия, читай она базу,
       * всегда видела бы `SENT` и молча превратилась бы в пустую формальность.
       */
      offerStatusBefore: OfferStatus | null;
    }
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

/** Предложение, у которого сменился статус, и компания-адресат события. */
export interface OfferStatusUpdate {
  offerId: string;
  companyId: string;
  status: OfferStatus;
}

/** Результат перехода. Из него Фаза 5 соберёт события WebSocket (ТЗ §8). */
export interface AppliedTransition {
  order: Order;
  offerId: string;
  companyId: string;
  fromStatus: OrderStatus;
  nextStatus: OrderStatus;
  /**
   * Все затронутые предложения, а не только то, по которому пришло событие:
   * при принятии одного остальные уходят в `NOT_ACCEPTED`, и каждой из этих
   * компаний адресовано своё `offer:status_changed`.
   */
  offerUpdates: OfferStatusUpdate[];
  notifications: Notification[];
}

/**
 * Настройки транзакции перехода.
 *
 * Переход — это до девяти запросов подряд, и база managed, то есть задержка
 * сети умножается на девять. Дефолтные 5 секунд Prisma при плохой связи
 * истекают ещё до коммита, и переход падает на ровном месте. Запас важнее
 * пары секунд ожидания.
 *
 * Экспортируется, потому что вызывающий код иногда открывает транзакцию сам
 * (отправка предложения: запись предложения и переход обязаны быть одним
 * коммитом) и должен делать это с теми же запасами.
 */
export const TRANSITION_TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

type OfferWithCompany = {
  id: string;
  companyId: string;
  status: OfferStatus;
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

  /**
   * Выполнить переход.
   *
   * `tx` передаётся, когда переход обязан войти в чужую транзакцию: отправка
   * предложения записывает строку `Offer` и тут же двигает заказ, и разными
   * коммитами это делать нельзя — предложение осталось бы висеть в `SENT`
   * на заказе, который никуда не перешёл. Без `tx` сервис открывает
   * транзакцию сам.
   */
  async apply(
    command: OrderTransitionCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<AppliedTransition> {
    if (tx) {
      return this.run(tx, command);
    }

    return this.prisma.$transaction(
      (inner) => this.run(inner, command),
      TRANSITION_TX_OPTIONS,
    );
  }

  private async run(
    tx: Prisma.TransactionClient,
    command: OrderTransitionCommand,
  ): Promise<AppliedTransition> {
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

    const { updatedOrder, offerUpdates, notifications } = await this.applyEffects(
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
      offerUpdates,
      notifications,
    };
  }

  /**
   * Взять заказ под блокировку строки до конца транзакции.
   *
   * Без этого два одновременных запроса (например, клиент принимает одно
   * предложение, а компания в тот же момент отзывает другое) прочитали бы
   * один и тот же статус и записали бы поверх друг друга. Prisma строчных
   * блокировок не умеет, поэтому FOR UPDATE идёт сырым запросом.
   *
   * Публичный, потому что порядок блокировок обязан быть одинаковым во всех
   * транзакциях: тот, кто перед переходом пишет `Offer` сам, должен сначала
   * заблокировать заказ — иначе две транзакции берут те же строки в обратном
   * порядке и Postgres убивает одну из них по взаимной блокировке.
   */
  async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Order> {
    // Приведение к `uuid` в сыром запросе не прощает мусора: неверный
    // идентификатор упал бы в Postgres, то есть ушёл наружу как 500.
    if (!isUuid(orderId)) {
      throw new NotFoundException('Заказ не найден');
    }

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
    // Тот же случай, что и с заказом: колонка `Offer.id` типа `uuid`,
    // и мусор в идентификаторе дал бы 500 вместо 404.
    if ('offerId' in command && !isUuid(command.offerId)) {
      throw new NotFoundException('Предложение не найдено');
    }

    const select = {
      id: true,
      companyId: true,
      status: true,
      proposedPrice: true,
      proposedDeadline: true,
      company: { select: { companyName: true } },
    } as const;

    // Статус предложения здесь не фильтруется: подходит ли он событию,
    // решает state-машина — это правило перехода, а не выборка (ТЗ §4).
    //
    // Исполнитель ищется по `EXECUTOR_OFFER_STATUSES`, то есть вместе
    // с `COMPLETED`: у завершённого заказа исполнитель никуда не делся, и без
    // этого статуса повторное «Подтвердить выполнение» отвечало бы «у заказа
    // нет компании-исполнителя» — неправдой вместо честного «действие
    // недоступно» от state-машины.
    const offer =
      'offerId' in command
        ? await tx.offer.findFirst({
            where: { id: command.offerId, orderId },
            select,
          })
        : await tx.offer.findFirst({
            where: { orderId, status: { in: [...EXECUTOR_OFFER_STATUSES] } },
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
    const ref = {
      offerId: offer.id,
      companyId: offer.companyId,
      offerStatus: offer.status,
    };

    switch (command.type) {
      case OrderEventType.OFFER_SUBMITTED:
        return {
          type: command.type,
          ...ref,
          // Статус берётся из команды, а не из строки: см. `offerStatusBefore`.
          offerStatus: command.offerStatusBefore,
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
          // Проигравшие нужны поимённо: каждой компании — свой статус
          // и своё уведомление. Читаются под блокировкой строки заказа,
          // то есть параллельный переход их не изменит.
          otherOffers: (
            await tx.offer.findMany({
              where: {
                orderId: command.orderId,
                status: OfferStatus.SENT,
                id: { not: offer.id },
              },
              select: { id: true, companyId: true },
            })
          ).map((rival) => ({ offerId: rival.id, companyId: rival.companyId })),
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
  ): Promise<{
    updatedOrder: Order;
    offerUpdates: OfferStatusUpdate[];
    notifications: Notification[];
  }> {
    const orderData: Prisma.OrderUpdateInput = { status: nextStatus };
    const notificationsToCreate: Prisma.NotificationCreateManyInput[] = [];

    // Предложений в переходе может быть несколько: принимая одно, клиент
    // отказывает остальным.
    const offerUpdates: OfferStatusUpdate[] = [];

    // Сначала разбираем эффекты, потом пишем: так в цикле нет запросов
    // и порядок обращений к базе виден целиком.
    for (const effect of effects) {
      switch (effect.kind) {
        case 'SET_OFFER_STATUS':
          offerUpdates.push({
            offerId: effect.offerId,
            companyId: effect.companyId,
            status: effect.status,
          });
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

    // Обновления сгруппированы по новому статусу: сколько бы предложений
    // ни было у заказа, запросов остаётся не больше двух. Группы не
    // пересекаются по идентификаторам, поэтому порядок между ними не важен.
    await Promise.all(
      [...groupOfferIdsByStatus(offerUpdates)].map(([status, offerIds]) =>
        tx.offer.updateMany({ where: { id: { in: offerIds } }, data: { status } }),
      ),
    );

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: orderData,
    });

    // Уведомления пишутся здесь же, а не отдельным вызовом после коммита:
    // иначе смена статуса могла бы пройти без уведомления (ТЗ §8).
    const notifications = notificationsToCreate.length
      ? await tx.notification.createManyAndReturn({ data: notificationsToCreate })
      : [];

    return { updatedOrder, offerUpdates, notifications };
  }
}

function groupOfferIdsByStatus(
  updates: OfferStatusUpdate[],
): Map<OfferStatus, string[]> {
  const grouped = new Map<OfferStatus, string[]>();

  for (const update of updates) {
    const ids = grouped.get(update.status);
    if (ids) ids.push(update.offerId);
    else grouped.set(update.status, [update.offerId]);
  }

  return grouped;
}
