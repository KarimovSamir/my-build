/**
 * Одно правило на весь фронт: картинка это или документ.
 *
 * По префиксу `image/` судить нельзя — канонический тип DWG это `image/vnd.dwg`
 * (`shared/src/api.ts`), и чертёж получал бы иконку фотографии. Поэтому список
 * растровых типов задан явно, а имя файла приводится к типу той же таблицей
 * расширений, по которой тип определяет backend.
 */

import { FILE_EXTENSION_MIME, fileExtension, type AllowedFileMimeType } from "@/lib/types";

const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Тип из базы или из `File.type`. Параметры после «;» отбрасываются. */
function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType));
}

/**
 * Как тип файла называется в списке (ТЗ §7: «имя, тип, размер, дата…»).
 *
 * Название берётся из типа, а не из расширения в имени: имя пишет пользователь,
 * а `mimeType` проставил backend по своей таблице расширений и сверил
 * по первым байтам. Ключи — весь список разрешённых типов, поэтому новый тип
 * в allowlist не соберётся, пока ему не придумано название.
 */
const MIME_LABELS: Record<AllowedFileMimeType, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WEBP",
  "image/vnd.dwg": "DWG",
  "application/dxf": "DXF",
};

/**
 * Строка вроде «PDF» или «DWG».
 *
 * Запасное «Файл» — не мёртвая ветка: allowlist за время жизни проекта уже
 * менялся, а строки `OrderFile` со старым типом остаются в базе навсегда.
 */
export function fileKindLabel(mimeType: string): string {
  const labels: Record<string, string | undefined> = MIME_LABELS;

  return labels[normalizeMimeType(mimeType)] ?? "Файл";
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
