import type { SupabaseClient, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { wipeDatabase } from './database-wipe.js';

/**
 * Очистка базы без сети: Admin API и база подставные. Проверяется то, что
 * нельзя увидеть глазами до беды: демо-учётки не удаляются (иначе посетители
 * теряют сессию), чужие удаляются все, а бакет чистится только после коммита.
 */

function authUser(id: string, demo: boolean): User {
  return {
    id,
    email: `${id}@example.test`,
    app_metadata: demo ? { demo: true } : {},
  } as unknown as User;
}

function createStubs(options: { users: User[]; objects?: string[] }) {
  const events: string[] = [];

  const admin = {
    listUsers: vi.fn(async (_params: { page: number; perPage: number }) => ({
      data: { users: options.users },
      error: null,
    })),
    deleteUser: vi.fn(async (id: string) => {
      events.push(`deleteUser:${id}`);
      return { data: {}, error: null };
    }),
  };

  const deleted = (table: string) =>
    vi.fn(async (_args: unknown) => {
      events.push(`delete:${table}`);
      return { count: 0 };
    });

  const tx = {
    $queryRaw: vi.fn(async () => {
      events.push('lock');
      return [];
    }),
    order: { deleteMany: deleted('order') },
    offer: { deleteMany: deleted('offer') },
    notification: { deleteMany: deleted('notification') },
    payment: { deleteMany: deleted('payment') },
    userCard: { deleteMany: deleted('userCard') },
  };

  const prisma = {
    $transaction: vi.fn(async <T>(run: (client: typeof tx) => Promise<T>) => {
      events.push('tx:start');
      const result = await run(tx);
      events.push('tx:commit');
      return result;
    }),
    $queryRaw: vi.fn(async () => {
      events.push('listObjects');
      return (options.objects ?? []).map((name) => ({ name }));
    }),
  };

  const removeObjects = vi.fn(async (_keys: string[]) => {
    events.push('removeObjects');
  });

  return {
    deps: {
      prisma: prisma as unknown as PrismaClient,
      admin: { auth: { admin } } as unknown as SupabaseClient,
      bucket: 'order-files',
      removeObjects,
    },
    admin,
    tx,
    removeObjects,
    events,
  };
}

describe('wipeDatabase', () => {
  it('удаляет все учётки, кроме демо', async () => {
    const { deps, admin } = createStubs({
      users: [
        authUser('demo-client', true),
        authUser('e2e-company', false),
        authUser('visitor', false),
        authUser('demo-company', true),
      ],
    });

    const result = await wipeDatabase(deps);

    // Демо-учётки остаются: у вошедших в демо посетителей не пропадёт сессия.
    expect(admin.deleteUser.mock.calls.map(([id]) => id).toSorted()).toEqual([
      'e2e-company',
      'visitor',
    ]);
    expect(result.deletedUsers).toBe(2);
  });

  it('стирает все данные одной транзакцией под блокировкой демо', async () => {
    const { deps, tx, events } = createStubs({ users: [authUser('demo-client', true)] });

    await wipeDatabase(deps);

    // Без условий: после удаления чужих учёток остались только данные демо,
    // и их тоже не должно быть — стандартные заливает `resetDemo`.
    for (const table of [tx.order, tx.offer, tx.notification, tx.payment, tx.userCard]) {
      expect(table.deleteMany).toHaveBeenCalledWith({});
    }
    // Блокировка — первым запросом, как у планового сброса.
    expect(events.slice(events.indexOf('tx:start'), events.indexOf('tx:start') + 2)).toEqual([
      'tx:start',
      'lock',
    ]);
  });

  it('чистит бакет целиком и только после коммита', async () => {
    const { deps, removeObjects, events } = createStubs({
      users: [authUser('demo-client', true)],
      objects: ['orders/o1/client/0/a.pdf', 'orders/o2/company/1/b.png'],
    });

    const result = await wipeDatabase(deps);

    expect(removeObjects).toHaveBeenCalledWith([
      'orders/o1/client/0/a.pdf',
      'orders/o2/company/1/b.png',
    ]);
    expect(result.removedObjects).toBe(2);
    // Удалить объекты до коммита — значит оставить строки без файлов при откате.
    expect(events.indexOf('removeObjects')).toBeGreaterThan(events.indexOf('tx:commit'));
  });

  it('чужие учётки удаляются до стирания данных', async () => {
    const { deps, events } = createStubs({
      users: [authUser('demo-client', true), authUser('visitor', false)],
    });

    await wipeDatabase(deps);

    expect(events.indexOf('deleteUser:visitor')).toBeLessThan(events.indexOf('tx:start'));
  });
});
