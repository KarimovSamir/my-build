/**
 * Заказы клиента: создание, список с поиском, детали, удаление (ТЗ §4.1, §5).
 *
 * Логики статусов здесь нет — она вся в `OrderStateMachine`. Этот сервис
 * работает только с теми переходами, которых у машины нет по построению:
 * появление заказа в `WAITING` и его удаление до начала работ.
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  DELETABLE_ORDER_STATUSES,
  EXECUTOR_OFFER_STATUSES,
  FileOwnerType,
  OrderStatus,
  canDeleteOrder,
  type OrderDetail,
  type OrderListItem,
  type Paginated,
} from '@mybuild/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadedFileInput } from '../files/file-validation.js';
import { FilesService } from '../files/files.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersQueryDto } from './dto/list-orders.dto.js';
import { buildSearchConditions } from './order-search.js';
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
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
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

    const page = query.page || 1;
    const pageSize = query.pageSize || DEFAULT_PAGE_SIZE;

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { offers: EXECUTOR_OFFER_SELECT },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => toOrderListItem(row, { id: clientId })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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
   */
  async remove(orderId: string, status: OrderStatus): Promise<void> {
    if (!canDeleteOrder(status)) {
      throw new ConflictException(ORDER_NOT_DELETABLE);
    }

    const storageKeys = await this.files.listStorageKeys(orderId);

    const { count } = await this.prisma.order.deleteMany({
      where: { id: orderId, status: { in: DELETABLE_STATUSES } },
    });

    if (count === 0) {
      throw new ConflictException(ORDER_NOT_DELETABLE);
    }

    await this.files.removeStorageObjects(storageKeys);
  }
}
