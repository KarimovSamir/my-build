import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_FILE_MIME_TYPES,
  FILE_EXTENSION_MIME,
  MAX_FILE_SIZE_BYTES,
} from '@mybuild/shared';

import {
  MIME_ALIASES,
  prepareFile,
  resolveMimeType,
  sanitizeFileName,
} from './file-validation.js';

const content = Buffer.from('содержимое файла');

function file(originalName: string, mimeType: string, buffer = content) {
  return { originalName, mimeType, buffer };
}

describe('allowlist из shared/', () => {
  it('backend узнаёт каждый тип, который разрешён во фронте', () => {
    // Иначе тип, добавленный в shared/ (по нему фронт отбирает файлы в
    // диалоге выбора), молча отвергался бы бэкендом, и расхождение всплыло
    // бы только на живой загрузке.
    const unknown = [...ALLOWED_FILE_MIME_TYPES].filter((mime) => !MIME_ALIASES[mime]);

    expect(unknown).toEqual([]);
  });

  it('каждому каноническому типу соответствует расширение', () => {
    const byExtension = new Set(Object.values(FILE_EXTENSION_MIME));
    const canonical = new Set(Object.values(MIME_ALIASES));

    expect([...canonical].filter((mime) => !byExtension.has(mime))).toEqual([]);
  });
});

describe('resolveMimeType', () => {
  it('принимает разрешённые типы и канонизирует синонимы', () => {
    expect(resolveMimeType('plan.pdf', 'application/pdf')).toBe('application/pdf');
    expect(resolveMimeType('photo.JPG', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveMimeType('photo.jpeg', 'image/jpg')).toBe('image/jpeg');
    expect(resolveMimeType('draft.dwg', 'application/acad')).toBe('image/vnd.dwg');
    expect(resolveMimeType('draft.dxf', 'image/vnd.dxf')).toBe('application/dxf');
  });

  it('игнорирует параметры заголовка после «;»', () => {
    expect(resolveMimeType('plan.pdf', 'application/pdf; charset=binary')).toBe(
      'application/pdf',
    );
  });

  it('верит расширению, когда браузер не опознал тип', () => {
    // Ровно этот случай и происходит при загрузке DWG из браузера.
    expect(resolveMimeType('draft.dwg', 'application/octet-stream')).toBe(
      'image/vnd.dwg',
    );
    expect(resolveMimeType('plan.pdf', '')).toBe('application/pdf');
  });

  it('отклоняет расширение вне allowlist', () => {
    expect(() => resolveMimeType('script.exe', 'application/pdf')).toThrow(
      BadRequestException,
    );
    expect(() => resolveMimeType('archive.zip', 'application/zip')).toThrow(
      BadRequestException,
    );
    expect(() => resolveMimeType('noext', 'application/pdf')).toThrow(
      BadRequestException,
    );
  });

  it('отклоняет тип, не совпадающий с расширением', () => {
    expect(() => resolveMimeType('plan.pdf', 'application/x-msdownload')).toThrow(
      BadRequestException,
    );
    expect(() => resolveMimeType('plan.pdf', 'image/png')).toThrow(BadRequestException);
  });
});

describe('sanitizeFileName', () => {
  it('транслитерирует кириллицу', () => {
    expect(sanitizeFileName('План квартиры.pdf')).toBe('plan-kvartiry.pdf');
    expect(sanitizeFileName('Щёткин-дом.DWG')).toBe('schetkin-dom.dwg');
  });

  it('отрезает путь, который присылают некоторые загрузчики', () => {
    expect(sanitizeFileName('C:\\Users\\Sam\\plan.pdf')).toBe('plan.pdf');
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
  });

  it('схлопывает недопустимые символы и не оставляет их по краям', () => {
    expect(sanitizeFileName('  plan   (v2)!!.pdf  ')).toBe('plan-v2.pdf');
    expect(sanitizeFileName('---.pdf')).toBe('file.pdf');
  });

  it('ограничивает длину имени', () => {
    const name = sanitizeFileName(`${'a'.repeat(200)}.pdf`);

    expect(name.endsWith('.pdf')).toBe(true);
    expect(name.length).toBe(84);
  });
});

describe('prepareFile', () => {
  it('считает SHA-256, размер и канонический тип', () => {
    const prepared = prepareFile(file('План.pdf', 'application/pdf'));

    expect(prepared).toMatchObject({
      originalName: 'План.pdf',
      safeName: 'plan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.byteLength,
      fileHash: createHash('sha256').update(content).digest('hex'),
    });
  });

  it('отклоняет пустой файл', () => {
    expect(() => prepareFile(file('plan.pdf', 'application/pdf', Buffer.alloc(0)))).toThrow(
      BadRequestException,
    );
  });

  it('отклоняет файл больше 20 МБ', () => {
    const tooBig = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);

    expect(() => prepareFile(file('plan.pdf', 'application/pdf', tooBig))).toThrow(
      PayloadTooLargeException,
    );
  });

  it('размер берёт по содержимому, а не по заявленному', () => {
    // Клиент может соврать про размер в multipart — считаем сами.
    const prepared = prepareFile(file('plan.pdf', 'application/pdf'));

    expect(prepared.sizeBytes).toBe(content.byteLength);
  });
});
