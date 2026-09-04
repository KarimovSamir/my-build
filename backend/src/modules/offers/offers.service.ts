/**
 * Предложения компаний (ТЗ §4.1, §5).
 *
 * Логики статусов здесь нет: каждое действие — событие для `OrderStateMachine`,
 * которое применяет `OrderTransitionService`. Этот сервис отвечает за три
 * другие вещи: кто имеет право трогать предложение, что именно записать
 * в строку `Offer` и что показать в списках.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OfferStatus,
  type CompanyOfferItem,
  type OfferDto,
  type OrderListItem,
  type Paginated,
} from '@mybuild/shared';

import type { SearchQueryDto } from '../../common/dto/pagination.dto.js';
import { pageRequest, toPage } from '../../common/pagination.js';
import { isUuid } from '../../common/uuid.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrderEventType } from '../orders/order-state-machine.js';
import {
  OrderTransitionService,
  TRANSITION_TX_OPTIONS,
} from '../orders/order-transition.service.js';
import { toOfferDto, toOrderListItem } from '../orders/order-view.js';
import { buildAvailableOrdersWhere } from './available-orders.js';
import type { CreateOfferDto } from './dto/create-offer.dto.js';
import type { ListCompanyOffersQueryDto } from './dto/list-company-offers.dto.js';

const OFFER_NOT_FOUND = 'Предложение не найдено';

/** Предложение в том объёме, который нужен `toOfferDto`. */
const OFFER_INCLUDE = {
  company: { select: { companyName: true } },
} as const;

/** Кто спрашивает про предложение и в каком качестве. */
type OfferActor = { companyId: string } | { clientId: string };

/** События, которыми предложение выбывает из выбора клиента. */
type LeaveSelectionEvent =
  | typeof OrderEventType.OFFER_WITHDRAWN
  | typeof OrderEventType.OFFER_REJECTED;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
  ) {}

  /**
   * Отправить или обновить предложение (ТЗ §4.1, семантика upsert).
   *
   * Запись предложения и переход заказа идут одной транзакцией. Разными
   * коммитами их делать нельзя: упади переход после записи — предложение
   * осталось бы в `SENT` на заказе, который никуда не перешёл, а клиент
   * не получил бы уведомления.
   *
   * Заказ блокируется первым, до записи предложения. Порядок обязателен:
   * переход берёт те же две строки именно в таком порядке, и обратный
   * порядок здесь дал бы взаимную блокировку с принятием чужого предложения.
   */
  async submit(companyId: string, dto: CreateOfferDto): Promise<OfferDto> {
    const key = { orderId_companyId: { orderId: dto.orderId, companyId } };

    const data = {
      status: OfferStatus.SENT,
      proposedPrice: dto.proposedPrice,
      proposedDeadline: new Date(dto.proposedDeadline),
      comment: dto.comment ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const order = await this.transitions.lockOrder(tx, dto.orderId);

      // Статус читается до записи: upsert перепишет его в `SENT`, и проверка
      // предусловия в машине, узнай она статус после, всегда видела бы `SENT`
      // и ничего бы не значила.
      const existing = await tx.offer.findUnique({ where: key, select: { status: true } });

      const offer = await tx.offer.upsert({
        where: key,
        create: { orderId: order.id, companyId, ...data },
        update: data,
        include: OFFER_INCLUDE,
      });

      await this.transitions.apply(
        {
          type: OrderEventType.OFFER_SUBMITTED,
          orderId: order.id,
          offerId: offer.id,
          offerStatusBefore: existing?.status ?? null,
        },
        tx,
      );

      return toOfferDto(offer);
    }, TRANSITION_TX_OPTIONS);
  }

  /** Компания отзывает своё предложение (ТЗ §5). */
  async withdraw(companyId: string, offerId: string): Promise<OfferDto> {
    return this.leaveSelection(offerId, { companyId }, OrderEventType.OFFER_WITHDRAWN);
  }

  /** Клиент отклоняет предложение по своему заказу (ТЗ §5). */
  async reject(clientId: string, offerId: string): Promise<OfferDto> {
    return this.leaveSelection(offerId, { clientId }, OrderEventType.OFFER_REJECTED);
  }

  /**
   * Общая часть отзыва и отклонения: найти предложение, убедиться в праве
   * на него, провести переход и вернуть предложение уже в новом статусе.
   *
   * Заново читается вся строка, а не только новый статус: вместе со статусом
   * меняется `updatedAt`, и склеивать свежее поле со старой строкой значило бы
   * отдать наружу заведомо неверную дату.
   */
  private async leaveSelection(
    offerId: string,
    actor: OfferActor,
    event: LeaveSelectionEvent,
  ): Promise<OfferDto> {
    const offer = await this.findOffer(offerId, actor);

    await this.transitions.apply({ type: event, orderId: offer.orderId, offerId });

    const updated = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: OFFER_INCLUDE,
    });

    if (!updated) {
      throw new NotFoundException(OFFER_NOT_FOUND);
    }

    return toOfferDto(updated);
  }

  /**
   * Предложение, к которому спрашивающий имеет отношение: компания — к своему,
   * клиент — к любому по своему заказу.
   *
   * Чужое предложение отдаётся как «не найдено», а не «нет прав»: 403
   * подтвердил бы, что предложение с таким идентификатором существует, —
   * то же правило, что и в `OwnershipGuard`.
   */
  private async findOffer(
    offerId: string,
    actor: OfferActor,
  ): Promise<{ id: string; orderId: string }> {
    // Колонка `Offer.id` типа `uuid`: мусор в идентификаторе упал бы
    // в Postgres, то есть ушёл наружу как 500.
    if (!isUuid(offerId)) {
      throw new NotFoundException(OFFER_NOT_FOUND);
    }

    const where: Prisma.OfferWhereInput =
      'companyId' in actor
        ? { id: offerId, companyId: actor.companyId }
        : { id: offerId, order: { clientId: actor.clientId } };

    const offer = await this.prisma.offer.findFirst({
      where,
      select: { id: true, orderId: true },
    });

    if (!offer) {
      throw new NotFoundException(OFFER_NOT_FOUND);
    }

    return offer;
  }

  /**
   * Лента доступных для предложений заказов (ТЗ §4.1).
   *
   * Заказ показывается компании тем же `toOrderListItem`, что и клиенту:
   * правила видимости общие, а участия в заказе у компании здесь нет —
   * значит, статус она видит как `WAITING`, а цену сделки и подрядчика
   * не видит вовсе.
   */
  async listAvailableOrders(
    companyId: string,
    query: SearchQueryDto,
  ): Promise<Paginated<OrderListItem>> {
    const where = buildAvailableOrdersWhere(companyId, query.q);
    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        // Только своё предложение: чужие в ленте не нужны, и видеть их нельзя.
        include: { offers: { where: { companyId }, include: OFFER_INCLUDE } },
        orderBy: { createdAt: 'desc' },
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(
      rows.map((row) => toOrderListItem(row, { id: companyId })),
      request,
      total,
    );
  }

  /** Свои предложения компании: последние изменённые сверху (ТЗ §5). */
  async listOwnOffers(
    companyId: string,
    query: ListCompanyOffersQueryDto,
  ): Promise<Paginated<CompanyOfferItem>> {
    const where: Prisma.OfferWhereInput = { companyId };

    if (query.status) {
      where.status = query.status;
    }

    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        include: {
          ...OFFER_INCLUDE,
          order: {
            include: { offers: { where: { companyId }, include: OFFER_INCLUDE } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(
      // `Object.assign`, а не расплющивание: `toOfferDto` и так возвращает
      // свежий объект, копировать его второй раз незачем.
      rows.map((row) =>
        Object.assign(toOfferDto(row), {
          order: toOrderListItem(row.order, { id: companyId }),
        }),
      ),
      request,
      total,
    );
  }
}
