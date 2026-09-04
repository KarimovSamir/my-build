import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

import { MAX_FILE_SIZE_BYTES } from '@mybuild/shared';

import {
  pdfBytes,
  pngBytes,
  removeWrittenUploads,
  writeUpload,
} from '../../../test/support/uploads.js';
import { prepareFile, readFileBuffer, removeTempFiles } from './uploaded-file.js';

/**
 * Чтение загруженного файла с диска. Содержимое настоящее: подпись формата
 * проверяется по первым байтам, а хеш считается потоком — на подставном
 * буфере ни то, ни другое не проверить.
 */

afterAll(() => {
  removeWrittenUploads();
});

describe('prepareFile', () => {
  it('считает SHA-256, размер и канонический тип', async () => {
    const content = pdfBytes('содержимое файла');
    const prepared = await prepareFile(writeUpload('План.pdf', 'application/pdf', content));

    expect(prepared).toMatchObject({
      originalName: 'План.pdf',
      safeName: 'plan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.byteLength,
      fileHash: createHash('sha256').update(content).digest('hex'),
    });
  });

  it('верит расширению, когда браузер не опознал тип', async () => {
    const prepared = await prepareFile(
      writeUpload('Фото.png', 'application/octet-stream', pngBytes('пиксели')),
    );

    expect(prepared.mimeType).toBe('image/png');
  });

  it('отклоняет пустой файл', async () => {
    await expect(
      prepareFile(writeUpload('plan.pdf', 'application/pdf', Buffer.alloc(0))),
    ).rejects.toThrow(BadRequestException);
  });

  it('отклоняет файл больше 20 МБ', async () => {
    const upload = writeUpload('plan.pdf', 'application/pdf', pdfBytes('маленький'));

    // Размер подменяется, а не пишется на диск: тест не должен создавать 20 МБ.
    await expect(
      prepareFile({ ...upload, sizeBytes: MAX_FILE_SIZE_BYTES + 1 }),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('отклоняет содержимое, не совпадающее с типом', async () => {
    await expect(
      prepareFile(writeUpload('plan.pdf', 'application/pdf', Buffer.from('MZ\x90\x00'))),
    ).rejects.toThrow(BadRequestException);
  });

  it('отклоняет расширение вне allowlist до чтения содержимого', async () => {
    await expect(
      prepareFile(writeUpload('вирус.exe', 'application/pdf', pdfBytes('обманка'))),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('readFileBuffer', () => {
  it('отдаёт то же, что было записано', async () => {
    const content = pdfBytes('байты');
    const upload = writeUpload('plan.pdf', 'application/pdf', content);

    expect((await readFileBuffer(upload.path)).equals(content)).toBe(true);
  });
});

describe('removeTempFiles', () => {
  it('удаляет временные файлы запроса', async () => {
    const upload = writeUpload('plan.pdf', 'application/pdf', pdfBytes('мусор'));

    await removeTempFiles([upload.path]);

    expect(existsSync(upload.path)).toBe(false);
  });

  it('не падает на файле, которого уже нет', async () => {
    await expect(removeTempFiles(['/no/such/file.tmp'])).resolves.toBeUndefined();
  });
});
