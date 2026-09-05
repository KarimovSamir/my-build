import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileOwnerType, OfferStatus, OrderStatus, Role } from '@mybuild/shared';

import {
  pdfBytes,
  removeWrittenUploads,
  writeUpload,
} from '../../../test/support/uploads.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PreparedFile } from './file-validation.js';
import { FilesService } from './files.service.js';
import type { StorageService } from './storage.service.js';
import { prepareFile } from './uploaded-file.js';

/**
 * Проверяет то, чего не видно в валидации: дедупликацию в пределах сдачи,
 * уборку за собой при сбое и правило доступа к файлам заказа.
 *
 * База и хранилище подставные — правила должны проверяться без сети.
 * Что запись действительно доходит до Supabase, проверяет `test/files.e2e-spec.ts`.
 */

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = '33333333-3333-3333-3333-333333333333';
const STRANGER_ID = '44444444-4444-4444-4444-444444444444';

afterAll(() => {
  removeWrittenUploads();
});

/** Проверенный файл на диске — ровно то, что теперь принимает `attachFiles`. */
function upload(name: string, content: string): Promise<PreparedFile> {
  return prepareFile(writeUpload(name, 'application/pdf', pdfBytes(content)));
}

function hashOf(content: string): string {
  return createHash('sha256').update(pdfBytes(content)).digest('hex');
}

/** Ключ объекта в бакете — тот же, что строит `buildStorageKey`. */
function keyOf(content: string, safeName: string): string {
  return `orders/${ORDER_ID}/client/0/${hashOf(content).slice(0, 16)}-${safeName}`;
}

/** Заказ в подставной базе: предложения с их статусами, как в настоящей таблице. */
interface StubOrder {
  clientId: string;
  /** Статус заказа. По умолчанию — тот, в котором заказ уже никого не ищет. */
  status?: OrderStatus;
  offers: { companyId: string; status: OfferStatus }[];
}

/** Форма запроса, которую строит `assertFileAccess`. */
interface OrderFindUniqueArgs {
  select: {
    offers: { where: { companyId: string } };
  };
}

/**
 * Подставная база. Фильтрацию предложений выполняет по-настоящему: иначе
 * тест не отличил бы «компания-исполнитель» от «любая компания».
 */
function createPrismaStub(overrides: {
  existingHashes?: string[];
  /** Ключи объектов, на которые уже ссылаются строки в базе (проверка гонки). */
  liveKeys?: string[];
  order?: StubOrder | null;
}) {
  const stub = {
    /**
     * Строки файлов пишутся в транзакции: вместе с ними идёт проверка
     * вызывающего кода (`guard`), и она обязана видеть ту же транзакцию.
     * Подставная отдаёт сам стенд — как настоящая отдаёт клиент транзакции.
     */
    $transaction: vi.fn(async <T>(run: (tx: typeof stub) => Promise<T>) => run(stub)),
    orderFile: {
      createManyAndReturn: vi.fn(
        async ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((row, index) => ({
            ...row,
            id: `file-${index}`,
            createdAt: new Date('2026-09-03T10:00:00.000Z'),
          })),
      ),
      // Один и тот же метод обслуживает два запроса: отсев дублей спрашивает
      // хеши, уборка осиротевших объектов — ключи.
      findMany: vi.fn(async (args: { select: Record<string, boolean> }) =>
        args.select.storageKey
          ? (overrides.liveKeys ?? []).map((storageKey) => ({ storageKey }))
          : (overrides.existingHashes ?? []).map((fileHash) => ({ fileHash })),
      ),
      findUnique: vi.fn(async () => null),
    },
    order: {
      findUnique: vi.fn(async (args: OrderFindUniqueArgs) => {
        const order = overrides.order;
        if (!order) return null;

        const filter = args.select.offers.where;

        return {
          clientId: order.clientId,
          status: order.status ?? OrderStatus.IN_PROGRESS,
          offers: order.offers
            .filter((offer) => offer.companyId === filter.companyId)
            .map((offer) => ({ status: offer.status })),
        };
      }),
    },
  };

  return stub;
}

function createStorageStub() {
  // Параметры перечислены явно: без них Vitest считает, что мок вызывают
  // без аргументов, и `mock.calls[0][0]` перестаёт существовать для типов.
  return {
    upload: vi.fn(async (_key: string, _body: Buffer, _contentType: string) => undefined),
    createSignedUrl: vi.fn(
      async (_key: string, _downloadName: string) => 'https://signed.test/file',
    ),
    remove: vi.fn(async (_keys: string[]) => undefined),
  };
}

function createService(
  prisma: ReturnType<typeof createPrismaStub>,
  storage: ReturnType<typeof createStorageStub>,
): FilesService {
  return new FilesService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
}

describe('FilesService.attachFiles', () => {
  let storage: ReturnType<typeof createStorageStub>;

  beforeEach(() => {
    storage = createStorageStub();
  });

  it('сохраняет файл и складывает его в папку заказа', async () => {
    const prisma = createPrismaStub({});
    const files = await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [await upload('План.pdf', 'первый')],
    });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0]![0]).toBe(
      `orders/${ORDER_ID}/client/0/${hashOf('первый').slice(0, 16)}-plan.pdf`,
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      orderId: ORDER_ID,
      originalName: 'План.pdf',
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      mimeType: 'application/pdf',
    });
    // Ключ объекта наружу не уходит.
    expect(files[0]).not.toHaveProperty('storageKey');
  });

  it('не сохраняет один и тот же файл дважды внутри одной пачки', async () => {
    const prisma = createPrismaStub({});
    const files = await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      // Разные имена, одинаковое содержимое — дедуп идёт по SHA-256.
      files: [
        await upload('a.pdf', 'одно и то же'),
        await upload('b.pdf', 'одно и то же'),
      ],
    });

    expect(files).toHaveLength(1);
    // Остаётся первый: под этим именем пользователь файл и приложил.
    expect(files[0]!.originalName).toBe('a.pdf');
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('пропускает файл, уже загруженный в этой сдаче', async () => {
    const prisma = createPrismaStub({ existingHashes: [hashOf('старый')] });
    const files = await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 2,
      files: [await upload('a.pdf', 'старый'), await upload('b.pdf', 'новый')],
    });

    expect(files).toHaveLength(1);
    expect(files[0]!.originalName).toBe('b.pdf');
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('на полностью повторную загрузку не ходит в хранилище вовсе', async () => {
    const prisma = createPrismaStub({ existingHashes: [hashOf('старый')] });
    const files = await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 1,
      files: [await upload('a.pdf', 'старый')],
    });

    expect(files).toEqual([]);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('кладёт файлы сдачи в свою папку: тот же файл в новой сдаче сохраняется заново', async () => {
    const prisma = createPrismaStub({});
    await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 3,
      files: [await upload('акт.pdf', 'смета')],
    });

    expect(storage.upload.mock.calls[0]![0]).toContain('/company/3/');
  });

  it('убирает загруженное из хранилища, если запись в базу упала', async () => {
    const prisma = createPrismaStub({});
    prisma.orderFile.createManyAndReturn.mockRejectedValueOnce(
      new Error('база недоступна'),
    );

    await expect(
      createService(prisma, storage).attachFiles({
        orderId: ORDER_ID,
        ownerType: FileOwnerType.CLIENT,
        submissionRound: 0,
        files: [await upload('a.pdf', 'первый'), await upload('b.pdf', 'второй')],
      }),
    ).rejects.toThrow('база недоступна');

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0]![0]).toHaveLength(2);
  });

  /**
   * Проверка вызывающего кода идёт внутри той же транзакции, что и вставка:
   * пока файлы едут в бакет, сдача могла закрыться, и строки писать уже нельзя.
   */
  it('не пишет строки, если проверка вызывающего кода отказала', async () => {
    const prisma = createPrismaStub({});
    const guard = vi.fn(async (_tx: unknown) => {
      throw new Error('сдача уже отправлена');
    });

    await expect(
      createService(prisma, storage).attachFiles({
        orderId: ORDER_ID,
        ownerType: FileOwnerType.COMPANY,
        submissionRound: 1,
        files: [await upload('акт.pdf', 'смета')],
        guard,
      }),
    ).rejects.toThrow('сдача уже отправлена');

    expect(guard).toHaveBeenCalledTimes(1);
    expect(prisma.orderFile.createManyAndReturn).not.toHaveBeenCalled();
    // Загруженное без строки — мусор, который уже никто не найдёт.
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0]![0]).toHaveLength(1);
  });

  it('не трогает объект чужой строки, выигравшей гонку', async () => {
    // Тот же файл под тем же именем пришёл двумя запросами разом: строку
    // создал первый, наша не создалась из-за уникального ограничения.
    // Ключ у обеих одинаковый (в нём хеш содержимого), и удалять его нельзя —
    // иначе у чужой строки не останется объекта.
    const prisma = createPrismaStub({
      // Что база вернёт на запрос «какие ключи сейчас в ходу»: наша строка
      // по первому файлу и чужая — по второму.
      liveKeys: [keyOf('первый', 'a.pdf'), keyOf('второй', 'b.pdf')],
    });

    prisma.orderFile.createManyAndReturn.mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown>[] }) => [
        { ...data[0], id: 'file-0', createdAt: new Date() },
      ],
    );

    await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [await upload('a.pdf', 'первый'), await upload('b.pdf', 'второй')],
    });

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0]![0]).toEqual([]);
  });

  it('убирает объект, на который не сослалась ни одна строка', async () => {
    // То же содержимое, но пришло под другим именем: ключ отличается, чужая
    // строка на него не ссылается — этот объект действительно осиротел.
    const prisma = createPrismaStub({
      liveKeys: [keyOf('первый', 'a.pdf'), keyOf('второй', 'drugoe-imya.pdf')],
    });

    prisma.orderFile.createManyAndReturn.mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown>[] }) => [
        { ...data[0], id: 'file-0', createdAt: new Date() },
      ],
    );

    await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [await upload('a.pdf', 'первый'), await upload('b.pdf', 'второй')],
    });

    expect(storage.remove.mock.calls[0]![0]).toEqual([
      expect.stringContaining(`${hashOf('второй').slice(0, 16)}-b.pdf`),
    ]);
  });

  it('сбой уборки не уносит объекты уже созданных строк', async () => {
    // Уборка осиротевших объектов сама ходит в базу. Раньше её отказ попадал
    // во внешний `catch`, и тот удалял всю пачку ключей — включая ключи строк,
    // которые только что создались: строки остались бы без объектов (R3-Н1).
    const prisma = createPrismaStub({});

    prisma.orderFile.createManyAndReturn.mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown>[] }) => [
        { ...data[0], id: 'file-0', createdAt: new Date() },
      ],
    );
    prisma.orderFile.findMany.mockImplementation(async (args: {
      select: Record<string, boolean>;
    }) => {
      if (args.select.storageKey) throw new Error('база не ответила');
      return [];
    });

    await expect(
      createService(prisma, storage).attachFiles({
        orderId: ORDER_ID,
        ownerType: FileOwnerType.CLIENT,
        submissionRound: 0,
        files: [await upload('a.pdf', 'первый'), await upload('b.pdf', 'второй')],
      }),
    ).rejects.toThrow('база не ответила');

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('не принимает пустой список файлов', async () => {
    await expect(
      createService(createPrismaStub({}), storage).attachFiles({
        orderId: ORDER_ID,
        ownerType: FileOwnerType.CLIENT,
        submissionRound: 0,
        files: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('FilesService.prepareUploads', () => {
  it('не пропускает пачку, если хоть один файл не прошёл проверку', async () => {
    const storage = createStorageStub();

    await expect(
      createService(createPrismaStub({}), storage).prepareUploads([
        writeUpload('ok.pdf', 'application/pdf', pdfBytes('первый')),
        writeUpload('virus.exe', 'application/pdf', pdfBytes('второй')),
      ]),
    ).rejects.toThrow(BadRequestException);

    // Проверка идёт до создания заказа, поэтому в хранилище не уходит ничего.
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('не принимает пустой список', async () => {
    await expect(
      createService(createPrismaStub({}), createStorageStub()).prepareUploads([]),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('FilesService.assertFileAccess', () => {
  function serviceFor(order: StubOrder | null): FilesService {
    return createService(createPrismaStub({ order }), createStorageStub());
  }

  const accepted = { companyId: COMPANY_ID, status: OfferStatus.ACCEPTED };

  /** Компания и посторонний клиент — разница между ними только в роли. */
  const company = { id: COMPANY_ID, role: Role.COMPANY };
  const stranger = { id: STRANGER_ID, role: Role.COMPANY };
  const client = { id: CLIENT_ID, role: Role.CLIENT };

  it('пускает клиента заказа к любому файлу', async () => {
    const service = serviceFor({ clientId: CLIENT_ID, offers: [] });

    await expect(
      service.assertFileAccess(ORDER_ID, client, FileOwnerType.CLIENT),
    ).resolves.toBeUndefined();
    await expect(
      service.assertFileAccess(ORDER_ID, client, FileOwnerType.COMPANY),
    ).resolves.toBeUndefined();
  });

  it('пускает компанию-исполнителя к сдачам и к заданию', async () => {
    const service = serviceFor({ clientId: CLIENT_ID, offers: [accepted] });

    await expect(
      service.assertFileAccess(ORDER_ID, company, FileOwnerType.COMPANY),
    ).resolves.toBeUndefined();
    await expect(
      service.assertFileAccess(ORDER_ID, company, FileOwnerType.CLIENT),
    ).resolves.toBeUndefined();
  });

  it('оставляет доступ компании после завершения заказа', async () => {
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        status: OrderStatus.COMPLETED,
        offers: [{ companyId: COMPANY_ID, status: OfferStatus.COMPLETED }],
      }).assertFileAccess(ORDER_ID, company, FileOwnerType.COMPANY),
    ).resolves.toBeUndefined();
  });

  /**
   * Задание клиента открыто, пока заказ принимает предложения: по нему компания
   * и считает цену (решение пользователя от 5 сентября 2026). Сдачи чужой
   * компании этим не открываются — они остаются сторонам сделки (ТЗ §4.1).
   */
  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION])(
    'открывает задание клиента любой компании, пока заказ в статусе %s',
    async (status) => {
      const service = serviceFor({ clientId: CLIENT_ID, status, offers: [] });

      await expect(
        service.assertFileAccess(ORDER_ID, stranger, FileOwnerType.CLIENT),
      ).resolves.toBeUndefined();
      await expect(
        service.assertFileAccess(ORDER_ID, stranger, FileOwnerType.COMPANY),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('закрывает задание, как только заказ ушёл в работу', async () => {
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        status: OrderStatus.IN_PROGRESS,
        offers: [{ companyId: COMPANY_ID, status: OfferStatus.NOT_ACCEPTED }],
      }).assertFileAccess(ORDER_ID, company, FileOwnerType.CLIENT),
    ).rejects.toThrow(ForbiddenException);
  });

  /**
   * «Любая компания» — это именно компания: без проверки роли задание одного
   * клиента скачал бы другой, у которого к заказу нет никакого отношения.
   */
  it('не открывает задание постороннему клиенту', async () => {
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        status: OrderStatus.WAITING,
        offers: [],
      }).assertFileAccess(
        ORDER_ID,
        { id: STRANGER_ID, role: Role.CLIENT },
        FileOwnerType.CLIENT,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('не пускает без роли в токене', async () => {
    // Хук выключен — claim'а роли нет; «любая компания» тогда не подтверждается.
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        status: OrderStatus.WAITING,
        offers: [],
      }).assertFileAccess(
        ORDER_ID,
        { id: STRANGER_ID, role: null },
        FileOwnerType.CLIENT,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('не пускает к сдачам компанию, чьё предложение отозвано или отклонено', async () => {
    const statuses = [
      OfferStatus.SENT,
      OfferStatus.WITHDRAWN,
      OfferStatus.REJECTED,
      OfferStatus.NOT_ACCEPTED,
    ];

    await Promise.all(
      statuses.map((status) =>
        expect(
          serviceFor({
            clientId: CLIENT_ID,
            offers: [{ companyId: COMPANY_ID, status }],
          }).assertFileAccess(ORDER_ID, company, FileOwnerType.COMPANY),
        ).rejects.toThrow(ForbiddenException),
      ),
    );
  });

  it('не пускает постороннего к сдачам', async () => {
    await expect(
      serviceFor({ clientId: CLIENT_ID, offers: [accepted] }).assertFileAccess(
        ORDER_ID,
        stranger,
        FileOwnerType.COMPANY,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('на несуществующий заказ отдаёт 404', async () => {
    await expect(
      serviceFor(null).assertFileAccess(ORDER_ID, client, FileOwnerType.CLIENT),
    ).rejects.toThrow(NotFoundException);
  });
});
