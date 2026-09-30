import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  STALE_SIGNUP_AGE_MS,
  STALE_SIGNUP_BATCH,
  deleteStaleSignups,
  staleSignupsWhere,
} from './stale-signups.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');

function stubs(ids: string[], failOn?: string) {
  const findMany = vi.fn(async (_args: unknown) => ids.map((id) => ({ id })));
  const deleteUser = vi.fn(async (id: string) => ({
    data: {},
    error: id === failOn ? { message: 'нет доступа' } : null,
  }));

  return {
    findMany,
    deleteUser,
    deps: {
      prisma: { user: { findMany } } as unknown as Pick<PrismaClient, 'user'>,
      admin: { auth: { admin: { deleteUser } } } as unknown as SupabaseClient,
    },
  };
}

describe('staleSignupsWhere', () => {
  it('берёт только неподтверждённые и только старше суток', () => {
    expect(staleSignupsWhere(NOW)).toEqual({
      emailVerifiedAt: null,
      createdAt: { lt: new Date(NOW.getTime() - STALE_SIGNUP_AGE_MS) },
    });
  });
});

describe('deleteStaleSignups', () => {
  it('удаляет найденные учётки через Admin API пачкой ограниченного размера', async () => {
    const { deps, findMany, deleteUser } = stubs(['a', 'b']);

    await expect(deleteStaleSignups(deps, NOW)).resolves.toBe(2);

    expect(findMany.mock.calls[0]![0]).toMatchObject({
      where: staleSignupsWhere(NOW),
      take: STALE_SIGNUP_BATCH,
    });
    expect(deleteUser.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
  });

  it('когда удалять нечего, в Admin API не ходит', async () => {
    const { deps, deleteUser } = stubs([]);

    await expect(deleteStaleSignups(deps, NOW)).resolves.toBe(0);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('отказ Admin API не глотается — его логирует таймер', async () => {
    const { deps } = stubs(['a', 'b'], 'b');

    await expect(deleteStaleSignups(deps, NOW)).rejects.toThrow('нет доступа');
  });
});
