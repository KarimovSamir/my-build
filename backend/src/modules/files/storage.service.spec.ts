import { InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageService } from './storage.service.js';

/**
 * Что уходит наружу, когда хранилище отвечает ошибкой (находки R3-С2, R3-С3).
 *
 * Проверяется ровно две вещи: текст Supabase не доезжает до клиента (в нём
 * бывает имя бакета и путь объекта), а пропавший объект — это 404, а не 500.
 * Сеть подставная: настоящее хранилище проверяют e2e.
 */

const BUCKET = 'order-files';
const KEY = 'orders/11111111-1111-4111-8111-111111111111/client/0/deadbeef-plan.pdf';

/** Ошибка в том виде, в каком её отдаёт Supabase Storage. */
function storageError(message: string, code: string) {
  return { name: 'StorageApiError', message, code, status: 400, statusCode: '404' };
}

function createService(bucket: {
  upload?: unknown;
  createSignedUrl?: unknown;
  remove?: unknown;
}): StorageService {
  const supabase = {
    storage: { from: vi.fn(() => bucket) },
  } as unknown as SupabaseClient;

  const config = { getOrThrow: () => BUCKET } as unknown as ConfigService;

  return new StorageService(supabase, config);
}

describe('StorageService.upload', () => {
  it('молча кладёт объект, когда хранилище ответило без ошибки', async () => {
    const upload = vi.fn(async () => ({ error: null }));

    await expect(
      createService({ upload }).upload(KEY, Buffer.from('x'), 'application/pdf'),
    ).resolves.toBeUndefined();

    expect(upload.mock.calls[0]).toEqual([
      KEY,
      Buffer.from('x'),
      { contentType: 'application/pdf', upsert: true },
    ]);
  });

  it('не выносит текст ошибки хранилища наружу', async () => {
    const upload = vi.fn(async () => ({
      error: storageError(`Bucket ${BUCKET} not found`, 'NoSuchBucket'),
    }));

    const failing = createService({ upload }).upload(
      KEY,
      Buffer.from('x'),
      'application/pdf',
    );

    await expect(failing).rejects.toThrow(InternalServerErrorException);
    // Ни имени бакета, ни ключа объекта в ответе быть не должно.
    await expect(failing).rejects.toThrow('Не удалось сохранить файл в хранилище');
    await expect(failing).rejects.not.toThrow(BUCKET);
  });
});

describe('StorageService.createSignedUrl', () => {
  // Причина отказа пишется в лог — здесь она ожидаема и вывод прогона не засоряет.
  let logged = vi.spyOn(Logger.prototype, 'error');

  beforeEach(() => {
    logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('отдаёт подписанную ссылку', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://storage.example/signed' },
      error: null,
    }));

    await expect(
      createService({ createSignedUrl }).createSignedUrl(KEY, 'plan.pdf'),
    ).resolves.toBe('https://storage.example/signed');
  });

  it('на пропавший объект отдаёт 404, а не 500', async () => {
    // Строка в базе есть, а файла за ней нет: так выглядят seed-данные и следы
    // сбоя уборки. «Внутренняя ошибка сервера» здесь была бы неправдой.
    const createSignedUrl = vi.fn(async () => ({
      data: null,
      error: storageError('Object not found', 'NoSuchKey'),
    }));

    await expect(
      createService({ createSignedUrl }).createSignedUrl(KEY, 'plan.pdf'),
    ).rejects.toThrow(NotFoundException);
  });

  it('на любую другую ошибку отдаёт 500 без текста хранилища', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: null,
      error: storageError('Bucket order-files is not accessible', 'InvalidRequest'),
    }));

    const failing = createService({ createSignedUrl }).createSignedUrl(KEY, 'plan.pdf');

    await expect(failing).rejects.toThrow(InternalServerErrorException);
    await expect(failing).rejects.toThrow('Не удалось выпустить ссылку на файл');
    await expect(failing).rejects.not.toThrow(BUCKET);
  });

  it('причину отказа пишет в лог вместе с ключом объекта', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: null,
      error: storageError('Object not found', 'NoSuchKey'),
    }));

    await createService({ createSignedUrl })
      .createSignedUrl(KEY, 'plan.pdf')
      .catch(() => undefined);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining(KEY));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Object not found'));
  });
});

describe('StorageService.remove', () => {
  it('на пустом списке в хранилище не ходит', async () => {
    const remove = vi.fn(async () => ({ error: null }));

    await createService({ remove }).remove([]);

    expect(remove).not.toHaveBeenCalled();
  });

  it('ошибку уборки не бросает: операция по существу уже прошла', async () => {
    const remove = vi.fn(async () => ({ error: storageError('boom', 'Unknown') }));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(createService({ remove }).remove([KEY])).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
