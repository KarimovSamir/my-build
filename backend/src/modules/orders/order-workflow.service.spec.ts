import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FileOwnerType, NotificationType, OrderStatus } from '@mybuild/shared';

import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadedFileInput } from '../files/file-validation.js';
import type { FilesService } from '../files/files.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { OrderEventType } from './order-state-machine.js';
import type { OrderTransitionService } from './order-transition.service.js';
import { OrderWorkflowService } from './order-workflow.service.js';
import type { OrdersService } from './orders.service.js';

/**
 * Сделка и приёмка без базы: нумерация сдач, порядок блокировок и то, что
 * попадает в уведомления.
 *
 * Сами переходы статусов проверяет `order-state-machine.spec.ts`, запись
 * на живой базе — `test/workflow.e2e-spec.ts`. Здесь видно другое: что
 * загрузка файлов идёт **после** транзакции, что раунд считается под
 * блокировкой заказа и что снимок статуса из guard'а перепроверяется.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const OFFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const UPLOAD: UploadedFileInput = {
  originalName: 'Смета.pdf',
  mimeType: 'application/pdf',
  path: '/tmp/smeta.pdf',
  sizeBytes: 2048,
};

interface StubSubmission {
  id: string;
  round: number;
  submittedAt: Date | null;
}

interface StubOptions {
  /** Статус заказа под блокировкой — он может отличаться от снимка guard'а. */
  lockedStatus?: OrderStatus;
  submissions?: StubSubmission[];
  /** Сколько файлов компании уже лежит в текущем раунде. */
  filesInRound?: number;
  /** Что вернула загрузка: пустой массив — все файлы оказались дубликатами. */
  attached?: number;
  /** Площадь, уже уточнённая исполнителем. */
  verifiedSquareMeters?: number | null;
}

function createStubs(options: StubOptions = {}) {
  const submissions = options.submissions ?? [];
  const order = {
    id: ORDER_ID,
    orderNumber: 42,
    title: 'Ремонт квартиры',
    clientId: CLIENT_ID,
    status: options.lockedStatus ?? OrderStatus.IN_PROGRESS,
    verifiedSquareMeters: options.verifiedSquareMeters ?? null,
  };

  /** Порядок обращений: на живой базе взаимную блокировку так не поймать. */
  const trace: string[] = [];

  const tx = {
    orderSubmission: {
      // Один и тот же метод отвечает на два разных вопроса: «есть ли открытая
      // сдача» и «какой номер у последней». Различаются они условием запроса,
      // и подставная база обязана их различать — иначе тест не заметил бы,
      // что сервис спросил не то.
      findFirst: vi.fn(
        async (args: { where: { submittedAt?: null } }) => {
          trace.push('submission.findFirst');

          return args.where.submittedAt === null
            ? (submissions.findLast((row) => row.submittedAt === null) ?? null)
            : (submissions.at(-1) ?? null);
        },
      ),
      create: vi.fn(async ({ data }: { data: { round: number } }) => {
        trace.push('submission.create');
        return { id: 'submission-new', round: data.round };
      }),
      update: vi.fn(async (_args: unknown) => {
        trace.push('submission.update');
        return {};
      }),
    },
    orderFile: {
      count: vi.fn(async (_args: unknown) => options.filesInRound ?? 0),
    },
    order: {
      update: vi.fn(async (_args: unknown) => order),
    },
    notification: {
      create: vi.fn(async (_args: unknown) => ({ id: 'notification-tx' })),
    },
  };

  const prisma = {
    tx,
    $transaction: vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>, _options?: unknown) => fn(tx),
    ),
    notification: {
      create: vi.fn(async (_args: unknown) => ({ id: 'notification-1' })),
    },
  };

  const transitions = {
    apply: vi.fn(async (_command: unknown, _tx?: unknown) => ({})),
    lockOrder: vi.fn(async (_tx: unknown, _orderId: string) => {
      trace.push('lockOrder');
      return order;
    }),
  };

  const files = {
    prepareUploads: vi.fn(async (uploads: UploadedFileInput[]) =>
      uploads.map((upload) => ({ ...upload, fileHash: 'hash' })),
    ),
    attachFiles: vi.fn(async (_params: unknown) =>
      Array.from({ length: options.attached ?? 1 }, (_, index) => ({ id: `file-${index}` })),
    ),
  };

  const orders = {
    getDetail: vi.fn(async (_orderId: string, _viewer: { id: string }) => ({
      id: ORDER_ID,
    })),
  };

  // Рассылка подменяется целиком: кому какое событие адресовано, проверяет
  // `realtime-events.spec.ts`, здесь важно только то, что её вызвали.
  const realtime = {
    transitionApplied: vi.fn((_applied: unknown) => undefined),
    orderFilesUpdated: vi.fn(
      (_order: { id: string; clientId: string }, _rows: unknown[]) => undefined,
    ),
    orderAreaVerified: vi.fn(
      (_order: { id: string; clientId: string }, _rows: unknown[]) => undefined,
    ),
  };

  const service = new OrderWorkflowService(
    prisma as unknown as PrismaService,
    transitions as unknown as OrderTransitionService,
    files as unknown as FilesService,
    orders as unknown as OrdersService,
    realtime as unknown as RealtimeService,
  );

  return { service, prisma, transitions, files, orders, realtime, trace };
}

/** Аргументы `addFiles` с разумными значениями по умолчанию. */
function addFilesParams(overrides: Partial<Parameters<OrderWorkflowService['addFiles']>[0]> = {}) {
  return {
    orderId: ORDER_ID,
    status: OrderStatus.IN_PROGRESS,
    companyId: COMPANY_ID,
    comment: 'Готов первый этап',
    uploads: [UPLOAD],
    ...overrides,
  };
}

describe('OrderWorkflowService: действия клиента', () => {
  it('принимает предложение и отдаёт карточку глазами клиента', async () => {
    const { service, transitions, orders } = createStubs();

    await service.acceptOffer(ORDER_ID, OFFER_ID, CLIENT_ID);

    expect(transitions.apply.mock.calls[0]![0]).toEqual({
      type: OrderEventType.OFFER_ACCEPTED,
      orderId: ORDER_ID,
      offerId: OFFER_ID,
    });
    expect(orders.getDetail).toHaveBeenCalledWith(ORDER_ID, { id: CLIENT_ID });
  });

  it('подтверждает выполнение и передаёт необязательный комментарий', async () => {
    const { service, transitions } = createStubs();

    await service.confirm(ORDER_ID, CLIENT_ID, 'Спасибо');

    expect(transitions.apply.mock.calls[0]![0]).toEqual({
      type: OrderEventType.WORK_CONFIRMED,
      orderId: ORDER_ID,
      completionComment: 'Спасибо',
    });
  });

  it('отправляет на доработку с комментарием', async () => {
    const { service, transitions } = createStubs();

    await service.dispute(ORDER_ID, CLIENT_ID, 'Переделать проводку');

    expect(transitions.apply.mock.calls[0]![0]).toEqual({
      type: OrderEventType.WORK_DISPUTED,
      orderId: ORDER_ID,
      correctionComment: 'Переделать проводку',
    });
  });
});

describe('OrderWorkflowService: файлы сдачи', () => {
  it('отказывает по снимку guard’а, не читая файлы с диска', async () => {
    const { service, files, prisma } = createStubs();

    await expect(
      service.addFiles(
        addFilesParams({ status: OrderStatus.AWAITING_COMPLETION_CONFIRMATION }),
      ),
    ).rejects.toThrow(ConflictException);

    expect(files.prepareUploads).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('перепроверяет статус под блокировкой: снимок guard’а мог устареть', async () => {
    // Между guard'ом и транзакцией клиент успел подтвердить работу.
    const { service } = createStubs({ lockedStatus: OrderStatus.COMPLETED });

    await expect(service.addFiles(addFilesParams())).rejects.toThrow(ConflictException);
  });

  it('заводит первую сдачу и передаёт её номер в загрузку', async () => {
    const { service, prisma, files, trace } = createStubs();

    await service.addFiles(addFilesParams());

    expect(prisma.tx.orderSubmission.create.mock.calls[0]![0]).toMatchObject({
      data: { orderId: ORDER_ID, round: 1, comment: 'Готов первый этап' },
    });
    expect(files.attachFiles.mock.calls[0]![0]).toMatchObject({
      orderId: ORDER_ID,
      ownerType: FileOwnerType.COMPANY,
      submissionRound: 1,
    });
    // Заказ блокируется до всякой работы со сдачами — тем же порядком,
    // что и в переходе: иначе взаимная блокировка.
    expect(trace[0]).toBe('lockOrder');
  });

  it('грузит файлы в хранилище уже после коммита транзакции', async () => {
    // Держать транзакцию открытой, пока по сети едут мегабайты, нельзя.
    const { service, prisma, files } = createStubs();
    const order: string[] = [];

    prisma.$transaction.mockImplementation(async (fn) => {
      const result = await fn(prisma.tx);
      order.push('commit');
      return result;
    });
    files.attachFiles.mockImplementation(async () => {
      order.push('attachFiles');
      return [{ id: 'file-0' }];
    });

    await service.addFiles(addFilesParams());

    expect(order).toEqual(['commit', 'attachFiles']);
  });

  it('дописывает файлы в уже открытую сдачу и обновляет её комментарий', async () => {
    const { service, prisma, files } = createStubs({
      submissions: [{ id: 'submission-1', round: 1, submittedAt: null }],
    });

    await service.addFiles(addFilesParams({ comment: 'Добавил разрез' }));

    expect(prisma.tx.orderSubmission.create).not.toHaveBeenCalled();
    expect(prisma.tx.orderSubmission.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'submission-1' },
      data: { comment: 'Добавил разрез' },
    });
    expect(files.attachFiles.mock.calls[0]![0]).toMatchObject({ submissionRound: 1 });
  });

  it('после сданного раунда открывает следующий', async () => {
    const { service, prisma } = createStubs({
      lockedStatus: OrderStatus.COMPLETION_DISPUTED,
      submissions: [{ id: 'submission-1', round: 1, submittedAt: new Date() }],
    });

    await service.addFiles(
      addFilesParams({ status: OrderStatus.COMPLETION_DISPUTED, comment: 'Исправили' }),
    );

    expect(prisma.tx.orderSubmission.create.mock.calls[0]![0]).toMatchObject({
      data: { round: 2 },
    });
  });

  it('уведомляет клиента о новых файлах', async () => {
    const { service, prisma } = createStubs();

    await service.addFiles(addFilesParams());

    expect(prisma.notification.create.mock.calls[0]![0]).toMatchObject({
      data: {
        userId: CLIENT_ID,
        type: NotificationType.FILES_UPDATED,
        orderId: ORDER_ID,
      },
    });
  });

  /**
   * Между открытием сдачи и записью строк проходит вся загрузка в бакет,
   * и за это время компания могла сдать работу из другой вкладки. Проверка
   * идёт внутри той же транзакции, что и вставка, — отдельным запросом она
   * отвечала бы про уже устаревшее состояние.
   */
  it('не даёт дописать файлы в сдачу, закрытую во время загрузки', async () => {
    const { service, prisma, files, trace } = createStubs({
      submissions: [{ id: 'submission-1', round: 1, submittedAt: null }],
    });

    files.attachFiles.mockImplementation(async (params) => {
      // Сдача закрылась, пока файлы ехали в хранилище.
      prisma.tx.orderSubmission.findFirst.mockResolvedValueOnce(null);

      await (params as { guard: (tx: unknown) => Promise<void> }).guard(prisma.tx);
      return [{ id: 'file-0' }];
    });

    await expect(service.addFiles(addFilesParams())).rejects.toThrow(ConflictException);

    // Заказ блокируется и здесь, и тем же порядком: сначала он, потом сдача.
    expect(trace.filter((step) => step === 'lockOrder')).toHaveLength(2);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('молчит, если все файлы оказались дубликатами', async () => {
    // Дедупликация в пределах сдачи (ТЗ §4.1): в заказе ничего не изменилось,
    // и сообщать клиенту об изменении было бы неправдой.
    const { service, prisma } = createStubs({ attached: 0 });

    await service.addFiles(addFilesParams());

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('OrderWorkflowService: сдача работы', () => {
  it('закрывает сдачу и проводит переход одной транзакцией', async () => {
    const { service, prisma, transitions } = createStubs({
      submissions: [{ id: 'submission-1', round: 1, submittedAt: null }],
      filesInRound: 2,
    });

    await service.submitWork(ORDER_ID, COMPANY_ID);

    expect(transitions.apply.mock.calls[0]![0]).toEqual({
      type: OrderEventType.WORK_SUBMITTED,
      orderId: ORDER_ID,
    });
    // Второй аргумент — та же транзакция: без него Prisma открыла бы вторую,
    // и атомарности не было бы, хотя код выглядит правильно.
    expect(transitions.apply.mock.calls[0]![1]).toBe(prisma.tx);

    expect(prisma.tx.orderSubmission.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'submission-1' },
    });
    const { data } = prisma.tx.orderSubmission.update.mock.calls[0]![0] as {
      data: { submittedAt: Date };
    };
    expect(data.submittedAt).toBeInstanceOf(Date);
  });

  it('не даёт сдать работу, пока ничего не загружено', async () => {
    const { service, prisma } = createStubs({ submissions: [] });

    await expect(service.submitWork(ORDER_ID, COMPANY_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.tx.orderSubmission.update).not.toHaveBeenCalled();
  });

  it('не даёт сдать сдачу без единого файла', async () => {
    const { service } = createStubs({
      submissions: [{ id: 'submission-1', round: 1, submittedAt: null }],
      filesInRound: 0,
    });

    await expect(service.submitWork(ORDER_ID, COMPANY_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('о неподходящем статусе сообщает переход, а не проверка сдачи', async () => {
    // Заказ уже на проверке у клиента: ответить надо «недопустимое действие»,
    // а не «нечего сдавать» — иначе компания будет искать несуществующие файлы.
    const { service, transitions } = createStubs({ submissions: [] });
    transitions.apply.mockRejectedValue(new ConflictException('InvalidStateTransition'));

    await expect(service.submitWork(ORDER_ID, COMPANY_ID)).rejects.toThrow(
      'InvalidStateTransition',
    );
  });
});

describe('OrderWorkflowService: уточнение площади', () => {
  it('пишет площадь и уведомляет клиента, не трогая статус и цену', async () => {
    const { service, prisma } = createStubs();

    await service.verifyArea(ORDER_ID, OrderStatus.IN_PROGRESS, COMPANY_ID, 98.5);

    expect(prisma.tx.order.update.mock.calls[0]![0]).toEqual({
      where: { id: ORDER_ID },
      data: { verifiedSquareMeters: 98.5 },
    });
    expect(prisma.tx.notification.create.mock.calls[0]![0]).toMatchObject({
      data: {
        userId: CLIENT_ID,
        type: NotificationType.AREA_VERIFIED,
        orderId: ORDER_ID,
      },
    });
  });

  it.each([OrderStatus.WAITING, OrderStatus.AWAITING_CONFIRMATION, OrderStatus.COMPLETED])(
    'отказывает в статусе %s, не открывая транзакцию',
    async (status) => {
      const { service, prisma } = createStubs();

      await expect(
        service.verifyArea(ORDER_ID, status, COMPANY_ID, 98),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('на то же значение не пишет ничего и не уведомляет', async () => {
    // Сохранение прежнего числа — не уточнение: уведомление «исполнитель
    // уточнил площадь» стало бы событием, которого не было (ТЗ §8).
    const { service, prisma } = createStubs({ verifiedSquareMeters: 98.5 });

    await service.verifyArea(ORDER_ID, OrderStatus.IN_PROGRESS, COMPANY_ID, 98.5);

    expect(prisma.tx.order.update).not.toHaveBeenCalled();
    expect(prisma.tx.notification.create).not.toHaveBeenCalled();
  });

  it('изменение уже уточнённой площади уведомление создаёт', async () => {
    const { service, prisma } = createStubs({ verifiedSquareMeters: 98.5 });

    await service.verifyArea(ORDER_ID, OrderStatus.IN_PROGRESS, COMPANY_ID, 101);

    expect(prisma.tx.order.update).toHaveBeenCalledTimes(1);
    expect(prisma.tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('перепроверяет статус под блокировкой', async () => {
    const { service, prisma } = createStubs({ lockedStatus: OrderStatus.COMPLETED });

    await expect(
      service.verifyArea(ORDER_ID, OrderStatus.IN_PROGRESS, COMPANY_ID, 98),
    ).rejects.toThrow(ConflictException);
    expect(prisma.tx.order.update).not.toHaveBeenCalled();
  });
});
