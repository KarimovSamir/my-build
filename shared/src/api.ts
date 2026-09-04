/** Общие формы ответов API (ТЗ §5, «Общие требования»). */

/** Страница списка. Пагинация обязательна для всех списков. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Единый формат ошибки, который отдаёт глобальный exception filter. */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** Размер страницы по умолчанию и потолок, чтобы клиент не мог запросить всё разом. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Лимиты загрузки файлов (ТЗ §5). */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Сколько файлов принимается за один запрос: и на форме, и в multer. */
export const MAX_FILES_PER_REQUEST = 10;

/**
 * Потолок на весь запрос с файлами.
 *
 * Лимит на отдельный файл не ограничивает запрос целиком: десять файлов
 * по 20 МБ — это 200 МБ, которые сервер обязан куда-то принять. Запас сверх
 * произведения — на текстовые поля формы и разделители multipart.
 *
 * Проверяется по заголовку `Content-Length` до разбора тела, то есть до того,
 * как хоть один байт будет записан.
 */
export const MAX_UPLOAD_REQUEST_BYTES =
  MAX_FILES_PER_REQUEST * MAX_FILE_SIZE_BYTES + 1024 * 1024;

export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/acad',
  'image/vnd.dwg',
  'application/dxf',
] as const;

export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];

/**
 * Расширение → тип, который записывается в базу.
 *
 * Расширение здесь главнее заголовка запроса: браузеры для DWG/DXF в половине
 * случаев присылают `application/octet-stream`, а для остальных типов заголовок
 * легко подделать. Таблица лежит в `shared/`, потому что по ней и форма
 * отсеивает файл до отправки, и backend решает, что записать в `mimeType`.
 */
export const FILE_EXTENSION_MIME: Record<string, AllowedFileMimeType> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.dwg': 'image/vnd.dwg',
  '.dxf': 'application/dxf',
};

/** Расширения из таблицы выше — для атрибута `accept` и проверки в браузере. */
export const ALLOWED_FILE_EXTENSIONS = Object.keys(FILE_EXTENSION_MIME);

/** Как список разрешённых типов называется в сообщениях пользователю. */
export const ALLOWED_FILE_EXTENSIONS_HINT = 'PDF, DWG, DXF, PNG, JPEG, WEBP';

/** Расширение имени файла в нижнем регистре, вместе с точкой. Пустая строка, если его нет. */
export function fileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');

  return dot > 0 ? trimmed.slice(dot).toLowerCase() : '';
}
