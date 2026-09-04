import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { TempUploadCleanupInterceptor } from './temp-upload-cleanup.interceptor.js';

/**
 * Единственное, что не даёт диску наполниться, когда запрос с файлами
 * отбит валидацией DTO: до контроллера он не доходит, а multer записать
 * успел. Работа с настоящими файлами здесь по делу — проверяется именно то,
 * что они исчезают.
 */

interface UploadRequest {
  files?: { path?: string }[];
}

const interceptor = new TempUploadCleanupInterceptor();
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Каталог с записанными файлами — как его оставляет multer. */
async function tempFiles(count: number): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'mybuild-cleanup-'));
  dirs.push(dir);

  const paths = Array.from({ length: count }, (_, index) => join(dir, `file-${index}.pdf`));
  await Promise.all(paths.map((path) => writeFile(path, 'содержимое')));

  return paths;
}

function contextFor(request: UploadRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function handlerOf(source: CallHandler['handle']): CallHandler {
  return { handle: source } as CallHandler;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/**
 * Уборка запускается в `finalize` и не ждётся ответом — иначе клиент ждал бы
 * удаления файлов. Поэтому результат проверяется с ожиданием, а не сразу.
 */
async function waitUntilGone(paths: string[]): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // Ожидание по определению последовательное.
    // oxlint-disable-next-line no-await-in-loop
    const present = await Promise.all(paths.map(exists));

    if (!present.includes(true)) return;

    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('TempUploadCleanupInterceptor', () => {
  it('убирает файлы после успешного ответа', async () => {
    const paths = await tempFiles(2);
    const request: UploadRequest = { files: paths.map((path) => ({ path })) };

    await lastValueFrom(interceptor.intercept(contextFor(request), handlerOf(() => of('ok'))));
    await waitUntilGone(paths);

    expect(await Promise.all(paths.map(exists))).toEqual([false, false]);
  });

  it('убирает файлы, когда запрос отбит ошибкой', async () => {
    // Ради этого случая интерсептор и появился: валидация DTO выполняется
    // после разбора multipart, и до контроллера запрос не доходит.
    const paths = await tempFiles(1);
    const request: UploadRequest = { files: paths.map((path) => ({ path })) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(request),
          handlerOf(() => throwError(() => new Error('валидация не прошла'))),
        ),
      ),
    ).rejects.toThrow('валидация не прошла');

    await waitUntilGone(paths);

    expect(await exists(paths[0]!)).toBe(false);
  });

  it('читает `request.files` в момент завершения, а не при вызове', async () => {
    // Интерсептор стоит первым в цепочке и вызывается до того, как multer
    // заполнит `request.files`. Читай он их сразу — убирать было бы нечего.
    const paths = await tempFiles(1);
    const request: UploadRequest = {};

    const result = interceptor.intercept(contextFor(request), handlerOf(() => of('ok')));
    request.files = paths.map((path) => ({ path }));

    await lastValueFrom(result);
    await waitUntilGone(paths);

    expect(await exists(paths[0]!)).toBe(false);
  });

  it('не падает на запросе без файлов и на записи без пути', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(contextFor({}), handlerOf(() => of('ok')))),
    ).resolves.toBe('ok');

    await expect(
      lastValueFrom(
        interceptor.intercept(contextFor({ files: [{}] }), handlerOf(() => of('ok'))),
      ),
    ).resolves.toBe('ok');
  });
});
