/**
 * Загружаемые файлы для тестов.
 *
 * Приложение больше не принимает файл буфером: multer пишет его во временный
 * каталог, а сервис читает с диска. Тестам нужен такой же вид входа — иначе
 * они проверяли бы то, чего в продакшене не происходит.
 *
 * Здесь же лежат корректные первые байты форматов: `assertFileSignature`
 * сверяет содержимое с типом, и «просто текст» под именем `plan.pdf` теперь
 * отклоняется по существу.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UploadedFileInput } from '../../src/modules/files/file-validation.js';

const createdDirs: string[] = [];

/** Байты PDF: подпись формата плюс произвольное содержимое. */
export function pdfBytes(content = ''): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(content)]);
}

/** Байты PNG: восьмибайтовая подпись плюс произвольное содержимое. */
export function pngBytes(content = ''): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(content),
  ]);
}

/** Файл на диске в том виде, в каком его отдаёт multer. */
export function writeUpload(
  originalName: string,
  mimeType: string,
  content: Buffer,
): UploadedFileInput {
  const dir = mkdtempSync(join(tmpdir(), 'mybuild-test-'));
  createdDirs.push(dir);

  const path = join(dir, 'upload.bin');
  writeFileSync(path, content);

  return { originalName, mimeType, path, sizeBytes: content.byteLength };
}

/** Убрать всё, что написал `writeUpload`. Вызывается в `afterAll`. */
export function removeWrittenUploads(): void {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
