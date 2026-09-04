import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  DELETABLE_ORDER_STATUSES,
  FileOwnerType,
  ObjectType,
  OrderCategory,
  OrderStatus,
} from '@mybuild/shared';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadedFileInput } from '../files/file-validation.js';
import type { FilesService } from '../files/files.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * Порядок обращений к базе и хранилищу — то, чего не видно в самих запросах
 * (находка Т-С3). Раньше это проверялось только e2e с живой Supabase.
 *
 * Что здесь важно: файлы проверяются до создания заказа, откат срабатывает
 * ровно на сбое загрузки, ключи объектов читаются до удаления строки,
 * а удаление заказа в работе не доходит до базы.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

const dto: CreateOrderDto = {
  title: 'Ремонт квартиры',
  category: OrderCategory.PLAN_IMPLEMENTATION,
  objectType: ObjectType.APARTMENT,
  description: 'Описание работ',
  address: 'Москва, ул. Тестовая, 1',
  squareMeters: 60,
};

/** Файл в том виде, в каком его отдаёт multer: содержимое лежит на диске. */
const upload = {
  originalName: 'план.pdf',
  mimeType: 'application/pdf',
  path: '/tmp/upload-1',
  sizeBytes: 1024,
} as UploadedFileInput;

/** Заказ со связями — ровно то, что читает `getDetail`. */
function orderRow(overrides: Partial<{ status: OrderStatus }> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: 42,
    clientId: CLIENT_ID,
    title: dto.title,
    status: overrides.status ?? OrderStatus.WAITING,
    category: dto.category,
    objectType: dto.objectType,
    description: dto.description,
    address: dto.address,
    squareMeters: dto.squareMeters,
    verifiedSquareMeters: null,
    clientBudget: new Prisma.Decimal('90000.00'),
    price: null,
    deadline: null,
    desiredStartDate: null,
    clientCompletionComment: null,
    correctionComment: null,
    createdAt: new Date('2026-09-04T10:00:00.000Z'),
    updatedAt: new Date('2026-09-04T10:00:00.000Z'),
    client: {
      id: CLIENT_ID,
      firstName: 'Анна',
      lastName: 'Клиентова',
      city: 'Москва',
      country: 'Россия',
    },
    offers: [],
  };
}

/** Аргументы запросов в том объёме, в каком их читают проверки ниже. */
interface WhereArgs {
  where: {
    id?: string;
    clientId?: string;
    status?: OrderStatus | { in: OrderStatus[] };
    OR?: unknown[];
  };
}

interface FindManyArgs extends WhereArgs {
  skip: number;
  take: number;
}

/**
 * Параметры моков перечислены явно: без них Vitest считает, что вызов идёт
 * без аргументов, и `mock.calls[0][0]` перестаёт существовать для типов.
 */
function createPrismaStub() {
  return {
    order: {
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => orderRow()),
      findUnique: vi.fn(
        async (_args: WhereArgs): Promise<ReturnType<typeof orderRow> | null> =>
          orderRow(),
      ),
      findMany: vi.fn(async (_args: FindManyArgs) => [orderRow()]),
      count: vi.fn(async (_args: WhereArgs) => 1),
      delete: vi.fn(async (_args: WhereArgs) => orderRow()),
      deleteMany: vi.fn(async (_args: WhereArgs) => ({ count: 1 })),
    },
  };
}

function createFilesStub() {
  return {
    prepareUploads: vi.fn(async (_files: UploadedFileInput[]) => [
      { originalName: 'план.pdf' },
    ]),
    attachFiles: vi.fn(async (_params: unknown) => []),
    listOrderFiles: vi.fn(async (_orderId: string) => []),
    listStorageKeys: vi.fn(async (_orderId: string) => ['orders/key-1']),
    removeStorageObjects: vi.fn(async (_keys: string[]) => undefined),
  };
}

type PrismaStub = ReturnType<typeof createPrismaStub>;
type FilesStub = ReturnType<typeof createFilesStub>;

function createService(prisma: PrismaStub, files: FilesStub): OrdersService {
  return new OrdersService(
    prisma as unknown as PrismaService,
    files as unknown as FilesService,
  );
}

describe('OrdersService.create', () => {
  let prisma: PrismaStub;
  let files: FilesStub;

  beforeEach(() => {
    prisma = createPrismaStub();
    files = createFilesStub();
  });

  it('проверяет файлы до создания заказа', async () => {
    // Порядок — смысл правки 3-Н4: отказ по типу файла не должен требовать
    // отката уже созданной строки.
    await createService(prisma, files).create(CLIENT_ID, dto, [upload]);

    expect(files.prepareUploads.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.order.create.mock.invocationCallOrder[0]!,
    );
  });

  it('не создаёт заказ, если файл не прошёл проверку', async () => {
    files.prepareUploads.mockRejectedValueOnce(new Error('недопустимый тип файла'));

    await expect(
      createService(prisma, files).create(CLIENT_ID, dto, [upload]),
    ).rejects.toThrow('недопустимый тип файла');

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('прикладывает файлы клиента к нулевой сдаче', async () => {
    await createService(prisma, files).create(CLIENT_ID, dto, [upload]);

    expect(files.attachFiles.mock.calls[0]![0]).toMatchObject({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
    });
  });

  it('без файлов в хранилище не ходит вовсе', async () => {
    await createService(prisma, files).create(CLIENT_ID, dto, []);

    expect(files.prepareUploads).not.toHaveBeenCalled();
    expect(files.attachFiles).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });

  it('откатывает заказ, если загрузка файлов сорвалась', async () => {
    files.attachFiles.mockRejectedValueOnce(new Error('хранилище недоступно'));

    await expect(
      createService(prisma, files).create(CLIENT_ID, dto, [upload]),
    ).rejects.toThrow('хранилище недоступно');

    expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: ORDER_ID } });
  });

  it('не подменяет причину отказа ошибкой отката', async () => {
    // Иначе понятный отказ по файлу превратился бы в 500 про базу.
    files.attachFiles.mockRejectedValueOnce(new Error('хранилище недоступно'));
    prisma.order.delete.mockRejectedValueOnce(new Error('база недоступна'));
    // Сбой отката пишется в лог — здесь он ожидаем и вывод прогона не засоряет.
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(
      createService(prisma, files).create(CLIENT_ID, dto, [upload]),
    ).rejects.toThrow('хранилище недоступно');

    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('отдаёт карточку заказа глазами его владельца', async () => {
    const detail = await createService(prisma, files).create(CLIENT_ID, dto, []);

    expect(detail).toMatchObject({ id: ORDER_ID, title: dto.title });
    // Владелец видит себя: у постороннего это поле было бы `null`.
    expect(detail.client?.id).toBe(CLIENT_ID);
  });
});

describe('OrdersService.list', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = createPrismaStub();
  });

  /** Запрос собирается настоящим DTO: у `page` и `pageSize` там свои умолчания. */
  function list(query: Partial<ListOrdersQueryDto>) {
    return createService(prisma, createFilesStub()).list(
      CLIENT_ID,
      Object.assign(new ListOrdersQueryDto(), query),
    );
  }

  it('показывает только заказы этого клиента', async () => {
    await list({});

    expect(prisma.order.findMany.mock.calls[0]![0]).toMatchObject({
      where: { clientId: CLIENT_ID },
    });
    expect(prisma.order.count.mock.calls[0]![0]).toMatchObject({
      where: { clientId: CLIENT_ID },
    });
  });

  it('фильтрует по статусу, когда он задан', async () => {
    await list({ status: OrderStatus.IN_PROGRESS });

    expect(prisma.order.findMany.mock.calls[0]![0]).toMatchObject({
      where: { clientId: CLIENT_ID, status: OrderStatus.IN_PROGRESS },
    });
  });

  it('добавляет условия поиска, когда есть строка запроса', async () => {
    await list({ q: 'кровля' });

    const where = prisma.order.findMany.mock.calls[0]![0].where;
    expect(where.OR?.length).toBeGreaterThan(0);
  });

  it('без поиска условий OR не добавляет', async () => {
    await list({});

    expect(prisma.order.findMany.mock.calls[0]![0].where.OR).toBeUndefined();
  });

  it('считает пропуск и размер страницы', async () => {
    prisma.order.count.mockResolvedValueOnce(45);

    const page = await list({ page: 3, pageSize: 10 });

    expect(prisma.order.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 20,
      take: 10,
    });
    expect(page).toMatchObject({ page: 3, pageSize: 10, total: 45, totalPages: 5 });
  });

  it('берёт размер страницы по умолчанию, когда он не задан', async () => {
    await list({});

    expect(prisma.order.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('на пустом списке отдаёт одну страницу, а не ноль', async () => {
    prisma.order.count.mockResolvedValueOnce(0);
    prisma.order.findMany.mockResolvedValueOnce([]);

    expect(await list({})).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });
});

describe('OrdersService.getDetail', () => {
  it('на несуществующий заказ отдаёт 404', async () => {
    const prisma = createPrismaStub();
    prisma.order.findUnique.mockResolvedValueOnce(null);

    await expect(
      createService(prisma, createFilesStub()).getDetail(ORDER_ID, { id: CLIENT_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('урезает карточку для постороннего', async () => {
    const detail = await createService(createPrismaStub(), createFilesStub()).getDetail(
      ORDER_ID,
      { id: '33333333-3333-4333-8333-333333333333' },
    );

    expect(detail.client).toBeNull();
    expect(detail.files).toEqual([]);
  });
});

describe('OrdersService.remove', () => {
  let prisma: PrismaStub;
  let files: FilesStub;

  beforeEach(() => {
    prisma = createPrismaStub();
    files = createFilesStub();
  });

  it('удаляет заказ и убирает объекты из бакета после удаления строки', async () => {
    await createService(prisma, files).remove(ORDER_ID, OrderStatus.WAITING);

    // Ключи нужно прочитать до удаления: строки `OrderFile` уходят каскадом,
    // и после этого узнать их неоткуда.
    expect(files.listStorageKeys.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.order.deleteMany.mock.invocationCallOrder[0]!,
    );
    expect(prisma.order.deleteMany.mock.invocationCallOrder[0]!).toBeLessThan(
      files.removeStorageObjects.mock.invocationCallOrder[0]!,
    );
    expect(files.removeStorageObjects).toHaveBeenCalledWith(['orders/key-1']);
  });

  it('удаляет только из статусов, где это разрешено', async () => {
    await createService(prisma, files).remove(ORDER_ID, OrderStatus.WAITING);

    // Условие в самом `DELETE` — вторая проверка статуса: снимок guard'а
    // мог устареть, пока запрос доходил до сервиса (находка 3-С2).
    expect(prisma.order.deleteMany.mock.calls[0]![0].where).toEqual({
      id: ORDER_ID,
      status: { in: [...DELETABLE_ORDER_STATUSES] },
    });
    expect([...DELETABLE_ORDER_STATUSES]).not.toContain(OrderStatus.IN_PROGRESS);
  });

  it.each([
    OrderStatus.IN_PROGRESS,
    OrderStatus.AWAITING_COMPLETION_CONFIRMATION,
    OrderStatus.COMPLETION_DISPUTED,
    OrderStatus.COMPLETED,
  ])('заказ в статусе %s не удаляет и в базу не ходит', async (status) => {
    await expect(
      createService(prisma, files).remove(ORDER_ID, status),
    ).rejects.toThrow(ConflictException);

    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
    expect(files.listStorageKeys).not.toHaveBeenCalled();
  });

  it('отдаёт 409, если заказ ушёл в работу между проверкой и удалением', async () => {
    // Гонка находки 3-С2: снимок guard'а показывал WAITING, но клиент успел
    // принять предложение. Ноль затронутых строк — отказ, а не тихий успех.
    prisma.order.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      createService(prisma, files).remove(ORDER_ID, OrderStatus.WAITING),
    ).rejects.toThrow(ConflictException);

    // Заказ остался жив — его файлы трогать нельзя.
    expect(files.removeStorageObjects).not.toHaveBeenCalled();
  });
});
