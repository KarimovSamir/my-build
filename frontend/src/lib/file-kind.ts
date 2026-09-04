/**
 * Одно правило на весь фронт: картинка это или документ.
 *
 * По префиксу `image/` судить нельзя — канонический тип DWG это `image/vnd.dwg`
 * (`shared/src/api.ts`), и чертёж получал бы иконку фотографии. Поэтому список
 * растровых типов задан явно, а имя файла приводится к типу той же таблицей
 * расширений, по которой тип определяет backend.
 */

import { FILE_EXTENSION_MIME, fileExtension } from "@/lib/types";

const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Тип из базы или из `File.type`. Параметры после «;» отбрасываются. */
export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.split(";")[0]!.trim().toLowerCase());
}

/**
 * Файл, ещё не отправленный на сервер: тип берётся по расширению.
 * Заголовок браузера здесь ненадёжен — для DWG/DXF он часто
 * `application/octet-stream`.
 */
export function isImageFileName(fileName: string): boolean {
  const mimeType = FILE_EXTENSION_MIME[fileExtension(fileName)];

  return mimeType !== undefined && isImageMimeType(mimeType);
}
