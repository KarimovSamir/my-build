/**
 * То, что multer кладёт в запрос, и перевод этого в форму `FilesService`.
 *
 * Пакет `@types/multer` не ставим: из всего его описания нужны четыре поля,
 * а лишняя зависимость — лишний повод для конфликта версий.
 *
 * `buffer` здесь нет намеренно: файлы пишутся во временный каталог, а не
 * в память процесса.
 */

import type { UploadedFileInput } from '../files/file-validation.js';

export interface MulterFile {
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

/** Файлы multer → форма, с которой работает `FilesService`. */
export function toUploads(files: MulterFile[] | undefined): UploadedFileInput[] {
  return (files ?? []).map((file) => ({
    originalName: file.originalname,
    mimeType: file.mimetype,
    path: file.path,
    sizeBytes: file.size,
  }));
}
