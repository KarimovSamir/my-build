import type { SupabaseClient, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { ACTIVE_OFFER_STATUSES, DEMO_EMAILS } from '@mybuild/shared';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { isDemoStale, resetDemo, type DemoResetDeps } from './demo-reset.js';

/**
 * Сброс демо без сети: Admin API и база подставные. Проверяется то, на чём
 * держится демо для остальных посетителей, — учётки с флагом не пересоздаются
 * (сессии живы), учётки без флага пересоздаются с флагом, объекты бакета
 * убираются только после коммита, а свежее демо не трогается вовсе.
 */

const HOUR = 60 * 60 * 1000;

interface AuthRow {
  id: string;
  email: string;
  demo: boolean;
}

function authUser({ id, email, demo }: AuthRow): User {
  return {
    id,
    email,
    app_metadata: demo ? { demo: true } : {},
  } as unknown as User;
}

function flagged(): AuthRow[] {
  return Object.entries(DEMO_EMAILS).map(([key, email]) => ({
    id: `id-${key}`,
    email,
    demo: true,
  }));
}

function createAdminStub(rows: AuthRow[]) {
  let created = 0;

  const admin = {
    listUsers: vi.fn(async (_params: { page: number; perPage: number }) => ({
      data: { users: rows.map(authUser) },
      error: null,
    })),
    deleteUser: vi.fn(async (_id: string) => ({ data: {}, error: null })),
    createUser: vi.fn(
      async (params: {
        email: string;
        app_metadata?: Record<string, unknown>;
      }) => {
        created += 1;
        return {
          data: { user: { id: `new-${created}`, email: params.email } as User },
          error: null,
        };
      },
    ),
  };

  return { client: { auth: { admin } } as unknown as SupabaseClient, admin };
}

/** Подставная база. `markerAt` — `updatedAt` профиля демо-клиента под блокировкой. */
function createPrismaStub(options: {
  markerAt?: Date;
  staleKeys?: string[];
  txKeys?: string[];
}) {
  let orderNumber = 0;
  const events: string[] = [];

  const tx = {
    $queryRaw: vi.fn(async () =>
      options.markerAt ? [{ updatedAt: options.markerAt }] : [],
    ),
    orderFile: {
      findMany: vi.fn(async () =>
        (options.txKeys ?? []).map((storageKey) => ({ storageKey })),
      ),
      createMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
    order: {
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
      create: vi.fn(async (args: { data: { title: string } }) => {
        orderNumber += 1;
        return {
          id: `order-${orderNumber}`,
          orderNumber,
          title: args.data.title,
        };
      }),
      // Уведомлениям нужны уже созданные заказы — отдаём ровно их.
      findMany: vi.fn(async () =>
        tx.order.create.mock.calls.map(([args], index) => ({
          id: `order-${index + 1}`,
          orderNumber: index + 1,
          title: args.data.title,
        })),
      ),
    },
    offer: { deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })) },
    notification: {
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
      createMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
    user: { update: vi.fn(async (_args: unknown) => ({})) },
  };

  const prisma = {
    $transaction: vi.fn(async <T>(run: (client: typeof tx) => Promise<T>) => {
      events.push('tx:start');
      const result = await run(tx);
      events.push('tx:commit');
      return result;
    }),
    // Вне транзакции файлы спрашивают только про пересоздаваемые учётки.
    orderFile: {
      findMany: vi.fn(async () =>
        (options.staleKeys ?? []).map((storageKey) => ({ storageKey })),
      ),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, tx, events };
}

function deps(
  prisma: PrismaClient,
  admin: SupabaseClient,
  events: string[] = [],
): DemoResetDeps & { removeObjects: ReturnType<typeof vi.fn> } {
  return {
    prisma,
    admin,
    password: 'пароль-демо',
    removeObjects: vi.fn(async (_keys: string[]) => {
      events.push('remove');
    }),
  };
}

describe('resetDemo', () => {
  it('учётки с флагом не пересоздаёт: сессии посетителей переживают сброс', async () => {
    const { client, admin } = createAdminStub(flagged());
    const { prisma, tx } = createPrismaStub({
      txKeys: ['orders/o1/client/0/a-plan.pdf'],
    });
    const reset = deps(prisma, client);

    const result = await resetDemo(reset);

    expect(result).toEqual({ recreatedUsers: 0, removedObjects: 1 });
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.createUser).not.toHaveBeenCalled();

    // Данные демо заведены заново, профили возвращены.
    expect(tx.order.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.offer.deleteMany).toHaveBeenCalledTimes(1);
    // Активные предложения демо-компаний по чужим заказам остаются: без них
    // заказ настоящего пользователя застрял бы «в работе» без исполнителя.
    expect(tx.offer.deleteMany.mock.calls[0]![0]).toMatchObject({
      where: { status: { notIn: [...ACTIVE_OFFER_STATUSES] } },
    });
    expect(tx.user.update).toHaveBeenCalledTimes(
      Object.keys(DEMO_EMAILS).length,
    );
    expect(tx.order.create).toHaveBeenCalled();
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(reset.removeObjects).toHaveBeenCalledWith([
      'orders/o1/client/0/a-plan.pdf',
    ]);
  });

  it('учётку без флага пересоздаёт с флагом и убирает файлы её прежних заказов', async () => {
    const rows = flagged();
    rows[0] = { ...rows[0]!, demo: false };
    const { client, admin } = createAdminStub(rows);
    const { prisma } = createPrismaStub({
      staleKeys: ['orders/old/client/0/x.pdf'],
    });
    const reset = deps(prisma, client);

    const result = await resetDemo(reset);

    expect(result?.recreatedUsers).toBe(1);
    expect(admin.deleteUser).toHaveBeenCalledWith(rows[0]!.id);
    expect(admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: rows[0]!.email,
        app_metadata: { demo: true },
      }),
    );
    expect(reset.removeObjects).toHaveBeenCalledWith([
      'orders/old/client/0/x.pdf',
    ]);
  });

  it('недостающую учётку просто создаёт', async () => {
    const { client, admin } = createAdminStub(flagged().slice(1));
    const { prisma } = createPrismaStub({});

    await resetDemo(deps(prisma, client));

    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.createUser).toHaveBeenCalledTimes(1);
  });

  it('свежее демо не трогает: второй сброс, дождавшись блокировки, уходит', async () => {
    const now = Date.parse('2026-09-23T12:00:00Z');
    const { client } = createAdminStub(flagged());
    const { prisma, tx } = createPrismaStub({ markerAt: new Date(now - HOUR) });
    const reset = deps(prisma, client);

    const result = await resetDemo(reset, {
      maxAgeMs: 6 * HOUR,
      now: () => now,
    });

    expect(result).toBeNull();
    expect(tx.order.deleteMany).not.toHaveBeenCalled();
    expect(reset.removeObjects).not.toHaveBeenCalled();
  });

  it('устаревшее демо сбрасывает и с проверкой срока', async () => {
    const now = Date.parse('2026-09-23T12:00:00Z');
    const { client } = createAdminStub(flagged());
    const { prisma, tx } = createPrismaStub({
      markerAt: new Date(now - 7 * HOUR),
    });

    await resetDemo(deps(prisma, client), {
      maxAgeMs: 6 * HOUR,
      now: () => now,
    });

    expect(tx.order.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('объекты бакета убирает только после коммита', async () => {
    const { client } = createAdminStub(flagged());
    const { prisma, events } = createPrismaStub({ txKeys: ['k'] });
    const reset = deps(prisma, client, events);

    await resetDemo(reset);

    expect(events).toEqual(['tx:start', 'tx:commit', 'remove']);
  });

  it('при откате транзакции бакет не трогает: строки остались бы без файлов', async () => {
    const { client } = createAdminStub(flagged());
    const { prisma, tx } = createPrismaStub({ txKeys: ['k'] });
    tx.order.deleteMany.mockRejectedValueOnce(new Error('база недоступна'));
    const reset = deps(prisma, client);

    await expect(resetDemo(reset)).rejects.toThrow('база недоступна');
    expect(reset.removeObjects).not.toHaveBeenCalled();
  });
});

describe('isDemoStale', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');

  it('считает устаревшим отсутствующее демо и демо старше срока', () => {
    expect(isDemoStale(null, 6 * HOUR, now)).toBe(true);
    expect(isDemoStale(new Date(now - 6 * HOUR), 6 * HOUR, now)).toBe(true);
  });

  it('свежее демо не трогает', () => {
    expect(isDemoStale(new Date(now - 6 * HOUR + 1), 6 * HOUR, now)).toBe(
      false,
    );
  });
});
