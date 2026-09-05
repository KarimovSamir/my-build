import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PAGE_SIZE, NotificationType } from '@mybuild/shared';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Что здесь важно: чужое уведомление не отдаётся и не помечается, непрочитанные
 * идут первыми на уровне запроса (а не одной страницы), а мусор в
 * идентификаторе не доходит до Postgres.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOTIFICATION_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '33333333-3333-4333-8333-333333333333';

function notificationRow(
  overrides: Partial<{ isRead: boolean; orderId: string | null }> = {},
) {
  return {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    // Тип объявлен широко: иначе фикстура сузилась бы до одного значения,
    // и подмена типа в отдельном тесте не собралась бы.
    type: NotificationType.OFFER_RECEIVED as NotificationType,
    orderId: overrides.orderId === undefined ? ORDER_ID : overrides.orderId,
    title: 'Новое предложение',
    body: 'ORD-42 «Ремонт»: предложение от «ООО Стройка»',
    isRead: overrides.isRead ?? false,
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
}

interface ListArgs {
  where: { userId: string; isRead?: boolean };
  orderBy?: { isRead?: string; createdAt?: string }[];
  skip?: number;
  take?: number;
}

interface UpdateManyArgs {
  where: { id?: string; userId: string; isRead?: boolean };
  data: { isRead: boolean };
}

function createPrismaStub() {
  return {
    notification: {
      findMany: vi.fn(async (_args: ListArgs) => [notificationRow()]),
      findUnique: vi.fn(
        async (_args: {
          where: { id: string };
        }): Promise<ReturnType<typeof notificationRow> | null> => notificationRow({ isRead: true }),
      ),
      count: vi.fn(async (_args: { where: { userId: string; isRead?: boolean } }) => 1),
      updateMany: vi.fn(async (_args: UpdateManyArgs) => ({ count: 1 })),
    },
  };
}

type PrismaStub = ReturnType<typeof createPrismaStub>;

function createService(prisma: PrismaStub): NotificationsService {
  return new NotificationsService(prisma as unknown as PrismaService);
}

/** Запрос собирается настоящим DTO: у страницы и её размера там свои умолчания. */
function query(
  overrides: Partial<Pick<ListNotificationsQueryDto, 'unread' | 'page' | 'pageSize'>> = {},
) {
  return Object.assign(new ListNotificationsQueryDto(), overrides);
}

describe('NotificationsService.list', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = createPrismaStub();
  });

  it('показывает только свои уведомления', async () => {
    await createService(prisma).list(USER_ID, query());

    expect(prisma.notification.findMany.mock.calls[0]![0].where).toEqual({
      userId: USER_ID,
    });
    expect(prisma.notification.count.mock.calls[0]![0].where).toEqual({
      userId: USER_ID,
    });
  });

  it('ставит непрочитанные первыми, а внутри группы — новые', async () => {
    // Сортировка обязана быть в запросе, а не в интерфейсе: список
    // постраничный, и на фронте непрочитанное со второй страницы вверх
    // уже не поднимется.
    await createService(prisma).list(USER_ID, query());

    expect(prisma.notification.findMany.mock.calls[0]![0].orderBy).toEqual([
      { isRead: 'asc' },
      { createdAt: 'desc' },
    ]);
  });

  it('по unread=true отдаёт только непрочитанные', async () => {
    await createService(prisma).list(USER_ID, query({ unread: 'true' }));

    expect(prisma.notification.findMany.mock.calls[0]![0].where).toEqual({
      userId: USER_ID,
      isRead: false,
    });
  });

  it('по unread=false отдаёт только прочитанные', async () => {
    await createService(prisma).list(USER_ID, query({ unread: 'false' }));

    expect(prisma.notification.findMany.mock.calls[0]![0].where).toEqual({
      userId: USER_ID,
      isRead: true,
    });
  });

  it('считает пропуск и размер страницы', async () => {
    prisma.notification.count.mockResolvedValueOnce(45);

    const page = await createService(prisma).list(
      USER_ID,
      query({ page: 3, pageSize: 10 }),
    );

    expect(prisma.notification.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 20,
      take: 10,
    });
    expect(page).toMatchObject({ page: 3, pageSize: 10, total: 45, totalPages: 5 });
  });

  it('берёт размер страницы по умолчанию', async () => {
    await createService(prisma).list(USER_ID, query());

    expect(prisma.notification.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('отдаёт уведомление без заказа как строку без ссылки', async () => {
    // Так приходит ORDER_DELETED: заказа больше нет, вести некуда.
    prisma.notification.findMany.mockResolvedValueOnce([
      { ...notificationRow({ orderId: null }), type: NotificationType.ORDER_DELETED },
    ]);

    const page = await createService(prisma).list(USER_ID, query());

    expect(page.items[0]).toMatchObject({
      type: NotificationType.ORDER_DELETED,
      orderId: null,
    });
  });

  it('отдаёт дату строкой ISO', async () => {
    const page = await createService(prisma).list(USER_ID, query());

    expect(page.items[0]!.createdAt).toBe('2026-09-05T10:00:00.000Z');
  });
});

describe('NotificationsService.unreadCount', () => {
  it('считает только свои непрочитанные', async () => {
    const prisma = createPrismaStub();
    prisma.notification.count.mockResolvedValueOnce(7);

    expect(await createService(prisma).unreadCount(USER_ID)).toEqual({ count: 7 });
    expect(prisma.notification.count.mock.calls[0]![0].where).toEqual({
      userId: USER_ID,
      isRead: false,
    });
  });
});

describe('NotificationsService.markRead', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = createPrismaStub();
  });

  it('помечает прочитанным только своё уведомление', async () => {
    const dto = await createService(prisma).markRead(USER_ID, NOTIFICATION_ID);

    expect(prisma.notification.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: NOTIFICATION_ID, userId: USER_ID },
      data: { isRead: true },
    });
    expect(dto).toMatchObject({ id: NOTIFICATION_ID, isRead: true });
  });

  it('на чужое уведомление отдаёт 404, а не 403', async () => {
    // 403 подтвердил бы, что такая строка существует.
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      createService(prisma).markRead(USER_ID, NOTIFICATION_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('на мусор в идентификаторе отвечает 404, не ходя в базу', async () => {
    // Колонка типа uuid: такой запрос упал бы в Postgres, то есть дал бы 500.
    await expect(createService(prisma).markRead(USER_ID, 'не-uuid')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.markAllRead', () => {
  it('помечает только свои непрочитанные и отдаёт их число', async () => {
    const prisma = createPrismaStub();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 5 });

    expect(await createService(prisma).markAllRead(USER_ID)).toEqual({ marked: 5 });
    expect(prisma.notification.updateMany.mock.calls[0]![0]).toEqual({
      where: { userId: USER_ID, isRead: false },
      data: { isRead: true },
    });
  });

  it('повторное нажатие — это ноль, а не ошибка', async () => {
    const prisma = createPrismaStub();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await createService(prisma).markAllRead(USER_ID)).toEqual({ marked: 0 });
  });
});
