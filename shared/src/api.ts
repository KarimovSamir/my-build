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

/**
 * Наибольший номер страницы.
 *
 * Граница нужна не для красоты: номер страницы превращается в `skip`
 * (`(page - 1) * pageSize`), а Prisma отказывается принимать значение,
 * которое не выражается обычным целым, — запрос падает `PrismaClientValidationError`,
 * то есть наружу уходит 500. Та же причина, что у `MAX_ORDER_NUMBER`:
 * число из пользовательского ввода надо ограничить до похода в базу.
 *
 * Сто тысяч страниц по сто записей — десять миллионов строк; до таких объёмов
 * пагинация по `skip` перестаёт быть уместной задолго до самого потолка.
 */
export const MAX_PAGE = 100_000;

/** Лимиты загрузки файлов (ТЗ §5). */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Самое длинное имя файла, в символах. Длиннее не даёт сохранить ни одна
 * распространённая файловая система (255 — предел имени у NTFS, ext4, APFS),
 * а без потолка имя в десятки килобайт уезжало бы в базу, в список файлов
 * и в текст каждой ошибки о нём.
 */
export const MAX_FILE_NAME_LENGTH = 255;

/**
 * Управляющие символы и символы направления текста — диапазонами кодов.
 *
 * Первые в имени файла не значат ничего. Вторые значат слишком много:
 * U+202E (RIGHT-TO-LEFT OVERRIDE) разворачивает конец строки, и имя
 * «счёт», U+202E, «fdp.exe» на экране читается как «счётexe.pdf» — видимое
 * расширение подменено. Настоящую арабскую или ивритскую строку их удаление
 * не портит: направление букв браузер определяет по самим буквам.
 *
 * Числами, а не символами в регулярном выражении: невидимый символ
 * направления в исходнике — ровно то, от чего эта проверка защищает.
 */
const UNSAFE_NAME_CODE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f], // управляющие C0
  [0x007f, 0x009f], // DEL и управляющие C1
  [0x061c, 0x061c], // ARABIC LETTER MARK
  [0x200e, 0x200f], // LEFT-TO-RIGHT и RIGHT-TO-LEFT MARK
  [0x202a, 0x202e], // встраивания и переопределения направления
  [0x2066, 0x2069], // изоляты направления
];

function isUnsafeNameCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return UNSAFE_NAME_CODE_RANGES.some(([from, to]) => code >= from && code <= to);
}

/**
 * Имя файла без управляющих символов и символов направления текста, без
 * пробелов по краям. Правило одно для формы и для backend: форма по нему
 * решает, принять ли файл, backend — что записать в `OrderFile.originalName`.
 */
export function cleanFileName(name: string): string {
  return [...name]
    .filter((character) => !isUnsafeNameCharacter(character))
    .join('')
    .trim();
}

/** Сколько файлов принимается за один запрос: и на форме, и в multer. */
export const MAX_FILES_PER_REQUEST = 10;

/**
 * Потолок на суммарный объём файлов одного заказа — задание клиента и все
 * сдачи исполнителя вместе (решение пользователя, в ТЗ этого нет).
 *
 * Ограничений на файл и на запрос для этого мало: 10 файлов по 20 МБ — это
 * 200 МБ за раз, а `POST /orders/:id/files` разрешён 20 раз в минуту. Один
 * исполнитель выбирал бы гигабайтную квоту бесплатного Supabase Storage
 * за считаные минуты.
 *
 * Считается по всем файлам заказа независимо от владельца: хранилищу
 * безразлично, кто занял место.
 */
export const MAX_ORDER_FILES_BYTES = 50 * 1024 * 1024;

/**
 * Запас на всё, что в запросе с файлами не файлы: текстовые поля формы
 * (самое длинное — описание заказа, до 15 КБ) и разделители multipart.
 */
export const UPLOAD_REQUEST_OVERHEAD_BYTES = 1024 * 1024;

/**
 * Потолок на весь запрос с файлами.
 *
 * Лимит на отдельный файл не ограничивает запрос целиком, а десять файлов
 * по 20 МБ — это 200 МБ на временный диск единственного инстанса. Столько
 * принимать незачем: все файлы заказа вместе не больше `MAX_ORDER_FILES_BYTES`,
 * то есть запрос крупнее квоты заказа отклонился бы всё равно — только уже
 * после записи на диск и подсчёта хешей.
 *
 * Проверяется по заголовку `Content-Length` до разбора тела, то есть до того,
 * как хоть один байт будет записан.
 */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_ORDER_FILES_BYTES + UPLOAD_REQUEST_OVERHEAD_BYTES;

/**
 * Типы, которые записываются в `OrderFile.mimeType`.
 *
 * Здесь только канонические значения — ровно те, что отдаёт `FILE_EXTENSION_MIME`.
 * Синонимы, которыми файл может представиться в запросе (`application/acad`,
 * `image/x-dwg` и прочие), живут отдельной таблицей на backend
 * (`MIME_ALIASES`): это входные значения, и в базу они не попадают.
 */
export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
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
