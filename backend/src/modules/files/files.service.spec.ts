import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileOwnerType, OfferStatus } from '@mybuild/shared';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { FilesService } from './files.service.js';
import type { StorageService } from './storage.service.js';

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

function upload(name: string, content: string) {
  return {
    originalName: name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(content),
  };
}

function hashOf(content: string): string {
  return createHash('sha256').update(Buffer.from(content)).digest('hex');
}

/** Заказ в подставной базе: предложения с их статусами, как в настоящей таблице. */
interface StubOrder {
  clientId: string;
  offers: { companyId: string; status: OfferStatus }[];
}

/** Форма запроса, которую строит `assertOrderParticipant`. */
interface OrderFindUniqueArgs {
  select: {
    offers: { where: { companyId: string; status: { in: OfferStatus[] } } };
  };
}

/**
 * Подставная база. Фильтрацию предложений выполняет по-настоящему: иначе
 * тест не отличил бы «компания-исполнитель» от «любая компания».
 */
function createPrismaStub(overrides: {
  existingHashes?: string[];
  order?: StubOrder | null;
}) {
  return {
    orderFile: {
      createManyAndReturn: vi.fn(
        async ({ data }: { data: Record<string, unknown>[] }) =>
          data.map((row, index) => ({
            ...row,
            id: `file-${index}`,
            createdAt: new Date('2026-09-03T10:00:00.000Z'),
          })),
      ),
      findMany: vi.fn(async () =>
        (overrides.existingHashes ?? []).map((fileHash) => ({ fileHash })),
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
          offers: order.offers
            .filter(
              (offer) =>
                offer.companyId === filter.companyId &&
                filter.status.in.includes(offer.status),
            )
            .map((_, index) => ({ id: `offer-${index}` })),
        };
      }),
    },
  };
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
      files: [upload('План.pdf', 'первый')],
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
      files: [upload('a.pdf', 'одно и то же'), upload('b.pdf', 'одно и то же')],
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
      files: [upload('a.pdf', 'старый'), upload('b.pdf', 'новый')],
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
      files: [upload('a.pdf', 'старый')],
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
      files: [upload('акт.pdf', 'смета')],
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
        files: [upload('a.pdf', 'первый'), upload('b.pdf', 'второй')],
      }),
    ).rejects.toThrow('база недоступна');

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0]![0]).toHaveLength(2);
  });

  it('убирает объекты, чьи строки не создались из-за гонки', async () => {
    const prisma = createPrismaStub({});
    // skipDuplicates: вторая строка не создалась, объект остался бы висеть.
    prisma.orderFile.createManyAndReturn.mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown>[] }) => [
        { ...data[0], id: 'file-0', createdAt: new Date() },
      ],
    );

    await createService(prisma, storage).attachFiles({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.CLIENT,
      submissionRound: 0,
      files: [upload('a.pdf', 'первый'), upload('b.pdf', 'второй')],
    });

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0]![0]).toEqual([
      expect.stringContaining(`${hashOf('второй').slice(0, 16)}-b.pdf`),
    ]);
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

  it('не трогает хранилище, если хоть один файл не прошёл проверку', async () => {
    await expect(
      createService(createPrismaStub({}), storage).attachFiles({
        orderId: ORDER_ID,
        ownerType: FileOwnerType.CLIENT,
        submissionRound: 0,
        files: [upload('ok.pdf', 'первый'), upload('virus.exe', 'второй')],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('FilesService.assertOrderParticipant', () => {
  function serviceFor(order: StubOrder | null): FilesService {
    return createService(createPrismaStub({ order }), createStorageStub());
  }

  const accepted = { companyId: COMPANY_ID, status: OfferStatus.ACCEPTED };

  it('пускает клиента заказа', async () => {
    await expect(
      serviceFor({ clientId: CLIENT_ID, offers: [] }).assertOrderParticipant(
        ORDER_ID,
        CLIENT_ID,
      ),
    ).resolves.toBeUndefined();
  });

  it('пускает компанию-исполнителя', async () => {
    await expect(
      serviceFor({ clientId: CLIENT_ID, offers: [accepted] }).assertOrderParticipant(
        ORDER_ID,
        COMPANY_ID,
      ),
    ).resolves.toBeUndefined();
  });

  it('оставляет доступ компании после завершения заказа', async () => {
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        offers: [{ companyId: COMPANY_ID, status: OfferStatus.COMPLETED }],
      }).assertOrderParticipant(ORDER_ID, COMPANY_ID),
    ).resolves.toBeUndefined();
  });

  it('не пускает компанию, чьё предложение только отправлено', async () => {
    // Предложение подано — но выбрали не её, файлов заказа она не видит (ТЗ §4.1).
    await expect(
      serviceFor({
        clientId: CLIENT_ID,
        offers: [{ companyId: COMPANY_ID, status: OfferStatus.SENT }],
      }).assertOrderParticipant(ORDER_ID, COMPANY_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('не пускает компанию, чьё предложение отозвано или отклонено', async () => {
    const statuses = [
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
          }).assertOrderParticipant(ORDER_ID, COMPANY_ID),
        ).rejects.toThrow(ForbiddenException),
      ),
    );
  });

  it('не пускает постороннего', async () => {
    await expect(
      serviceFor({ clientId: CLIENT_ID, offers: [accepted] }).assertOrderParticipant(
        ORDER_ID,
        STRANGER_ID,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('на несуществующий заказ отдаёт 404', async () => {
    await expect(
      serviceFor(null).assertOrderParticipant(ORDER_ID, CLIENT_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
