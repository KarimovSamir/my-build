/**
 * Заказы клиента: создание, список с поиском, детали, удаление (ТЗ §4.1, §5).
 *
 * Логики статусов здесь нет — она вся в `OrderStateMachine`. Этот сервис
 * работает только с теми переходами, которых у машины нет по построению:
 * появление заказа в `WAITING` и его удаление до начала работ.
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_OFFER_STATUSES,
  DELETABLE_ORDER_STATUSES,
  EXECUTOR_OFFER_STATUSES,
  FileOwnerType,
  NotificationType,
  OrderStatus,
  canDeleteOrder,
  notificationTypeLabels,
  type OrderDetail,
  type OrderListItem,
  type Paginated,
} from '@mybuild/shared';

import { pageRequest, toPage } from '../../common/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadedFileInput } from '../files/file-validation.js';
import { FilesService } from '../files/files.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersQueryDto } from './dto/list-orders.dto.js';
import { orderRef } from './order-notification.js';
import { buildSearchConditions } from './order-search.js';
import { OrderTransitionService, TRANSITION_TX_OPTIONS } from './order-transition.service.js';
import {
  toOrderDetail,
  toOrderListItem,
  type OrderDetailRow,
  type OrderViewer,
} from './order-view.js';

/**
 * Списки статусов в `shared/` объявлены `readonly`, а Prisma ждёт изменяемый
 * массив: копия делается один раз здесь, а не в каждом запросе.
 */
const EXECUTOR_STATUSES = [...EXECUTOR_OFFER_STATUSES];
const DELETABLE_STATUSES = [...DELETABLE_ORDER_STATUSES];
const ACTIVE_OFFER_STATUS_LIST = [...ACTIVE_OFFER_STATUSES];

const ORDER_NOT_DELETABLE = 'Заказ уже в работе — его нельзя удалить. Дождитесь завершения';

/** Предложение исполнителя — из него берётся колонка «Подрядчик». */
const EXECUTOR_OFFER_SELECT = {
  where: { status: { in: EXECUTOR_STATUSES } },
  include: { company: { select: { companyName: true } } },
  take: 1,
} as const;

const DETAIL_INCLUDE = {
  client: {
    select: { id: true, firstName: true, lastName: true, city: true, country: true },
  },
  offers: {
    include: { company: { select: { companyName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  // От первой сдачи к последней: интерфейс показывает последнюю, а прежние
  // складывает в «Историю сдач» (ТЗ §4.1).
  submissions: { orderBy: { round: 'asc' } },
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly transitions: OrderTransitionService,
  ) {}

  /**
   * Создать заказ вместе с приложенными файлами.
   *
   * Порядок: сначала проверка файлов, потом строка заказа, потом загрузка.
   * Проверка не требует идентификатора заказа, а вот ключ объекта в хранилище
   * — требует; поэтому отказ по типу или размеру файла происходит до того,
   * как в базе что-то появится, и откатывать нечего. Откат остаётся только
   * на случай сбоя самого хранилища или базы. Номера заказов при этом идут
   * с пропусками — это нормально для autoincrement и пользователю не видно.
   */
  async create(
    clientId: string,
    dto: CreateOrderDto,
    uploads: UploadedFileInput[],
  ): Promise<OrderDetail> {
    const files = uploads.length > 0 ? await this.files.prepareUploads(uploads) : [];

    const order = await this.prisma.order.create({
      data: {
        clientId,
        title: dto.title,
        category: dto.category,
        objectType: dto.objectType,
        description: dto.description,
        address: dto.address,
        squareMeters: dto.squareMeters,
        clientBudget: dto.clientBudget ?? null,
        desiredStartDate: dto.desiredStartDate ? new Date(dto.desiredStartDate) : null,
        status: OrderStatus.WAITING,
      },
    });

    if (files.length > 0) {
      try {
        await this.files.attachFiles({
          orderId: order.id,
          ownerType: FileOwnerType.CLIENT,
          // Файлы клиента всегда относятся к нулевой сдаче (ТЗ §3).
          submissionRound: 0,
          files,
        });
      } catch (error) {
        // Откат best-effort: наружу должна уйти исходная причина отказа,
        // а не ошибка уборки, которая превратила бы понятный отказ в 500.
        try {
          await this.prisma.order.delete({ where: { id: order.id } });
        } catch (rollbackError) {
          this.logger.error(
            `Не удалось откатить заказ ${order.id} после отказа на файлах`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
        }

        throw error;
      }
    }

    return this.getDetail(order.id, { id: clientId });
  }

  /** Заказы клиента: фильтр по статусу, поиск, пагинация (ТЗ §4.1). */
  async list(
    clientId: string,
    query: ListOrdersQueryDto,
  ): Promise<Paginated<OrderListItem>> {
    const where: Prisma.OrderWhereInput = { clientId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.q) {
      where.OR = buildSearchConditions(query.q);
    }

    const request = pageRequest(query);

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { offers: EXECUTOR_OFFER_SELECT },
        orderBy: { createdAt: 'desc' },
        skip: request.skip,
        take: request.pageSize,
      }),
    ]);

    return toPage(
      rows.map((row) => toOrderListItem(row, { id: clientId })),
      request,
      total,
    );
  }

  /**
   * Детали заказа в том объёме, который положен смотрящему (ТЗ §4.1).
   * Право открыть заказ проверяет `OwnershipGuard`, состав ответа — `order-view`.
   */
  async getDetail(orderId: string, viewer: OrderViewer): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: DETAIL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    const detail: OrderDetailRow = {
      ...order,
      files: await this.files.listOrderFiles(orderId),
    };

    return toOrderDetail(detail, viewer);
  }

  /**
   * Удалить заказ. Разрешено только до начала работ (ТЗ §4.1); владение
   * проверено guard'ом.
   *
   * Порядок важен: сначала читаем ключи, потом удаляем строку, и только затем
   * убираем объекты из бакета. Строки `OrderFile` уходят каскадом, а объекты
   * хранилища — нет, и после удаления строк их ключи узнать уже неоткуда.
   *
   * Статус проверяется дважды. Первая проверка — по снимку, который сделал
   * `OwnershipGuard`: она даёт понятный отказ до всякой работы. Вторая живёт
   * в самом `DELETE`: между чтением заказа и удалением клиент мог принять
   * предложение (Фаза 4), и безусловное удаление снесло бы заказ вместе
   * с начатыми работами.
   *
   * Удаление и уведомления компаниям — одна транзакция под блокировкой заказа.
   * Блокировка тем же порядком, что и в переходах (заказ первым): без неё
   * компания успела бы отправить предложение между чтением списка адресатов
   * и удалением, и её предложение исчезло бы молча.
   */
  async remove(orderId: string, status: OrderStatus): Promise<void> {
    if (!canDeleteOrder(status)) {
      throw new ConflictException(ORDER_NOT_DELETABLE);
    }

    const storageKeys = await this.files.listStorageKeys(orderId);

    await this.prisma.$transaction(
      (tx) => this.deleteWithNotices(tx, orderId),
      TRANSITION_TX_OPTIONS,
    );

    await this.files.removeStorageObjects(storageKeys);
  }

  /**
   * Снести заказ и известить компании, чьи предложения по нему были в игре
   * (решение пользователя от 5 сентября 2026; ТЗ этого не оговаривает).
   *
   * Уведомления пишутся **после** удаления и с `orderId: null`: строка `Offer`
   * уходит каскадом, заказа больше нет, и внешний ключ не на что указывать.
   * Номер и название заказа остаются в тексте — по ним компания и понимает,
   * о чём речь.
   */
  private async deleteWithNotices(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const order = await this.transitions.lockOrder(tx, orderId);

    // Отозванные и отклонённые предложения сюда не попадают: для такой
    // компании заказ уже чужой (ТЗ §4.1), и сообщать ей не о чем.
    const affected = await tx.offer.findMany({
      where: { orderId, status: { in: ACTIVE_OFFER_STATUS_LIST } },
      select: { companyId: true },
    });

    const { count } = await tx.order.deleteMany({
      where: { id: orderId, status: { in: DELETABLE_STATUSES } },
    });

    if (count === 0) {
      throw new ConflictException(ORDER_NOT_DELETABLE);
    }

    if (affected.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: affected.map(({ companyId }) => ({
        userId: companyId,
        type: NotificationType.ORDER_DELETED,
        orderId: null,
        title: notificationTypeLabels[NotificationType.ORDER_DELETED],
        body: `${orderRef(order)}: клиент удалил заказ, ваше предложение больше не действует`,
      })),
    });
  }
}
