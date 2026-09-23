/**
 * То, что multer кладёт в запрос, и перевод этого в форму `FilesService`.
 *
 * Пакет `@types/multer` не ставим: из всего его описания нужны четыре поля,
 * а лишняя зависимость — лишний повод для конфликта версий.
 *
 * `buffer` здесь нет намеренно: файлы пишутся во временный каталог, а не
 * в память процесса.
 */

import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';

import { MAX_FILES_PER_REQUEST, MAX_FILE_SIZE_BYTES } from '@mybuild/shared';

import type { UploadedFileInput } from '../files/file-validation.js';
import { UPLOAD_TEMP_DIR } from '../files/uploaded-file.js';

export interface MulterFile {
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

/**
 * Сколько текстовых полей принимает форма с файлами. У самой длинной —
 * создания заказа — их восемь; запас на то, что форма ещё подрастёт.
 */
const MAX_TEXT_FIELDS = 20;

/**
 * Настройки multer для обоих маршрутов загрузки.
 *
 * Текстовые поля multer держит в памяти, и по умолчанию их число
 * не ограничено, а каждое может весить мегабайт: один запрос с тысячами полей
 * выбивал бы единственный инстанс по памяти. Самое длинное поле — описание
 * заказа, 5000 символов, то есть до 15 КБ в UTF-8; 64 КБ — с запасом.
 *
 * `dest` вместо памяти: файлы пишутся во временный каталог, иначе содержимое
 * всего запроса (до 10 × 20 МБ) держалось бы в куче процесса. Убирает их
 * `TempUploadCleanupInterceptor` — он обязан идти первым.
 *
 * `defParamCharset: 'utf8'` обязателен: по умолчанию multer читает имена
 * файлов из multipart как latin1, и «План.pdf» попал бы в базу как
 * «ÐÐ»Ð°Ð½.pdf».
 */
export const UPLOAD_MULTER_OPTIONS: MulterOptions = {
  dest: UPLOAD_TEMP_DIR,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_REQUEST,
    fields: MAX_TEXT_FIELDS,
    fieldSize: 64 * 1024,
    fieldNameSize: 100,
    parts: MAX_FILES_PER_REQUEST + MAX_TEXT_FIELDS,
    headerPairs: 20,
  },
  defParamCharset: 'utf8',
};

/** Файлы multer → форма, с которой работает `FilesService`. */
export function toUploads(files: MulterFile[] | undefined): UploadedFileInput[] {
  return (files ?? []).map((file) => ({
    originalName: file.originalname,
    mimeType: file.mimetype,
    path: file.path,
    sizeBytes: file.size,
  }));
}
