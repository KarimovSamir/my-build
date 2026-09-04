/**
 * Чтение загруженного файла с диска (ТЗ §5, §6).
 *
 * Multer пишет тело запроса во временный каталог, а не в память: иначе десять
 * файлов по 20 МБ держались бы в куче процесса целиком, и несколько
 * одновременных загрузок укладывали бы инстанс по OOM.
 *
 * Здесь — единственное место модуля, которое ходит в файловую систему. Правила
 * проверки лежат рядом, в `file-validation.ts`, и остаются чистыми.
 */

import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FILE_HEAD_BYTES,
  assertFileSignature,
  assertUploadSize,
  resolveMimeType,
  sanitizeFileName,
  type PreparedFile,
  type UploadedFileInput,
} from './file-validation.js';

/**
 * Куда multer складывает файлы на время запроса.
 *
 * Каталог временный и переживать перезапуск не обязан: файлы удаляются сразу
 * после ответа, а всё, что уцелело после аварийного завершения, уберёт система.
 */
export const UPLOAD_TEMP_DIR = join(tmpdir(), 'mybuild-uploads');

mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

/**
 * Проверить файл и посчитать всё, что нужно для записи.
 * Бросает 400 на недопустимый тип и содержимое, 413 — на превышение размера.
 */
export async function prepareFile(file: UploadedFileInput): Promise<PreparedFile> {
  assertUploadSize(file.originalName, file.sizeBytes);

  const mimeType = resolveMimeType(file.originalName, file.mimeType);
  assertFileSignature(file.originalName, mimeType, await readHead(file.path));

  return {
    originalName: file.originalName,
    safeName: sanitizeFileName(file.originalName),
    mimeType,
    sizeBytes: file.sizeBytes,
    fileHash: await hashFile(file.path),
    path: file.path,
  };
}

/**
 * Содержимое файла целиком.
 *
 * Вызывается ровно на время загрузки в хранилище и по одному файлу за раз:
 * Supabase Storage принимает тело объекта буфером, поэтому совсем без памяти
 * не обойтись — но держится в ней не больше одного файла.
 */
export function readFileBuffer(path: string): Promise<Buffer> {
  return readFile(path);
}

/**
 * Удалить временные файлы запроса.
 *
 * Ошибку не бросает: файл мог быть уже убран, а уборка не должна ронять ответ,
 * который по существу уже сформирован.
 */
export async function removeTempFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true }).catch(() => undefined)));
}

/** Первые байты файла — по ним определяется формат. */
async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');

  try {
    const head = Buffer.alloc(FILE_HEAD_BYTES);
    const { bytesRead } = await handle.read(head, 0, FILE_HEAD_BYTES, 0);

    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** SHA-256 содержимого потоком: файл не попадает в память целиком. */
async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}
