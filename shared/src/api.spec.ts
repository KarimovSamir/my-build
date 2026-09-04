import { describe, expect, it } from 'vitest';

import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_MIME_TYPES,
  DEFAULT_PAGE_SIZE,
  FILE_EXTENSION_MIME,
  MAX_FILES_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_UPLOAD_REQUEST_BYTES,
  fileExtension,
} from './api.js';

/**
 * По этой таблице форма отсеивает файл до отправки, а backend решает, что
 * записать в `mimeType`. Расхождение внутри неё не поймал бы ни один тест
 * приложения (находка Т-Н3).
 */

describe('fileExtension', () => {
  it.each([
    ['план.pdf', '.pdf'],
    ['ЧЕРТЁЖ.DWG', '.dwg'],
    ['фото.JPEG', '.jpeg'],
    ['  смета.pdf  ', '.pdf'],
    ['архив.tar.gz', '.gz'],
    ['имя с точками...pdf', '.pdf'],
  ])('у %s расширение %s', (name, expected) => {
    expect(fileExtension(name)).toBe(expected);
  });

  it.each(['', 'README', '.gitignore', '   ', '.'])(
    'у %s расширения нет',
    (name) => {
      // Точка в начале — часть имени, а не расширение: `.gitignore` не файл `.gitignore`-типа.
      expect(fileExtension(name)).toBe('');
    },
  );
});

describe('таблица расширений', () => {
  it('каждый тип из таблицы разрешён', () => {
    for (const mime of Object.values(FILE_EXTENSION_MIME)) {
      expect(ALLOWED_FILE_MIME_TYPES).toContain(mime);
    }
  });

  it('у каждого расширения ключ начинается с точки и записан в нижнем регистре', () => {
    for (const extension of ALLOWED_FILE_EXTENSIONS) {
      expect(extension).toMatch(/^\.[a-z0-9]+$/);
    }
  });

  it('расширение из таблицы разбирается `fileExtension` один в один', () => {
    for (const extension of ALLOWED_FILE_EXTENSIONS) {
      expect(fileExtension(`файл${extension.toUpperCase()}`)).toBe(extension);
    }
  });

  it('оба написания JPEG ведут к одному типу', () => {
    expect(FILE_EXTENSION_MIME['.jpg']).toBe(FILE_EXTENSION_MIME['.jpeg']);
  });
});

describe('лимиты', () => {
  it('потолок запроса не меньше пачки файлов предельного размера', () => {
    // Иначе `UploadSizeGuard` отбивал бы запрос, разрешённый правилами ТЗ.
    expect(MAX_UPLOAD_REQUEST_BYTES).toBeGreaterThanOrEqual(
      MAX_FILES_PER_REQUEST * MAX_FILE_SIZE_BYTES,
    );
  });

  it('размер страницы по умолчанию не больше потолка', () => {
    expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('самый дальний возможный `skip` остаётся обычным целым', () => {
    // Из номера страницы считается `skip`; значение, которое не выражается
    // безопасным целым, Prisma не принимает — запрос падает на 500.
    const skip = (MAX_PAGE - 1) * MAX_PAGE_SIZE;

    expect(Number.isSafeInteger(skip)).toBe(true);
    expect(skip).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
