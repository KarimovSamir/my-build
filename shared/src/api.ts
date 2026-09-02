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
