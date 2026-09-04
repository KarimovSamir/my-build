/**
 * Проверка и нормализация загружаемых файлов (ТЗ §5, §6).
 *
 * Здесь нет ни базы, ни хранилища — чистые функции, поэтому все правила
 * проверяются unit-тестами без сети.
 */

import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import {
  ALLOWED_FILE_EXTENSIONS_HINT,
  FILE_EXTENSION_MIME,
  MAX_FILE_SIZE_BYTES,
  fileExtension,
  type AllowedFileMimeType,
  type FileOwnerType,
} from '@mybuild/shared';

/**
 * Файл, пришедший на загрузку.
 *
 * Содержимое лежит во временном файле на диске, а не в памяти: десять файлов
 * по 20 МБ в буферах — это 200 МБ на один запрос, чего инстанс с 512 МБ
 * не переживёт. Форма своя, не multer'овская: сервис не должен зависеть
 * от транспорта.
 */
export interface UploadedFileInput {
  originalName: string;
  mimeType: string;
  /** Путь к временному файлу. Удаляется после ответа, чей бы он ни был. */
  path: string;
  /** Сколько байт реально записано на диск. */
  sizeBytes: number;
}

/** Файл, прошедший проверку: тип канонизирован, содержимое посчитано. */
export interface PreparedFile {
  originalName: string;
  /** Имя, безопасное для ключа в хранилище. */
  safeName: string;
  mimeType: AllowedFileMimeType;
  sizeBytes: number;
  /** SHA-256 содержимого — по нему идёт дедупликация (ТЗ §4.1). */
  fileHash: string;
  path: string;
}

/**
 * Синонимы MIME: один и тот же тип разные браузеры и CAD-программы называют
 * по-разному. Приводим к каноническому значению, чтобы сравнить с расширением.
 */
export const MIME_ALIASES: Record<string, AllowedFileMimeType> = {
  'application/pdf': 'application/pdf',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/vnd.dwg': 'image/vnd.dwg',
  'image/x-dwg': 'image/vnd.dwg',
  'application/acad': 'image/vnd.dwg',
  'application/x-acad': 'image/vnd.dwg',
  'application/dxf': 'application/dxf',
  'image/vnd.dxf': 'application/dxf',
};

/** Тип, которым браузер помечает файл, когда не смог его опознать. */
const UNKNOWN_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Максимальная длина имени в ключе хранилища: сам ключ ограничен ~1024 байтами. */
const MAX_SAFE_NAME_LENGTH = 80;

/** Транслитерация кириллицы: имя файла попадает в ключ, а ключ держим ASCII. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

/**
 * Размер файла. Считается по тому, сколько байт реально доехало, а не по
 * тому, что заявил клиент в multipart.
 */
export function assertUploadSize(originalName: string, sizeBytes: number): void {
  if (sizeBytes === 0) {
    throw new BadRequestException(`Файл «${originalName}» пустой`);
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      `Файл «${originalName}» больше ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`,
    );
  }
}

/** Сколько первых байт файла нужно, чтобы узнать его формат. */
export const FILE_HEAD_BYTES = 16;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Подпись формата в первых байтах файла.
 *
 * `application/dxf` в таблице нет намеренно: DXF — текстовый обменный формат,
 * и однозначного начала у него не существует (файл может открываться и
 * секцией `0\nSECTION`, и строкой комментария `999`).
 */
const FILE_SIGNATURES: Partial<Record<AllowedFileMimeType, (head: Buffer) => boolean>> = {
  'application/pdf': (head) => head.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (head) => head.subarray(0, 8).equals(PNG_MAGIC),
  'image/jpeg': (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  'image/webp': (head) =>
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP',
  // DWG начинается с версии формата: AC1015, AC1018, AC1032 и так далее.
  'image/vnd.dwg': (head) => /^AC\d{4}$/.test(head.subarray(0, 6).toString('latin1')),
};

/**
 * Сверить содержимое с типом (ТЗ §6).
 *
 * Расширение и заголовок запроса задаёт клиент, поэтому `.pdf` с произвольными
 * байтами внутри проходил бы обе проверки. Здесь смотрим на сам файл: так
 * в бакет не попадёт исполняемый файл под видом чертежа.
 */
export function assertFileSignature(
  originalName: string,
  mimeType: AllowedFileMimeType,
  head: Buffer,
): void {
  const matches = FILE_SIGNATURES[mimeType];

  if (matches && !matches(head)) {
    throw new BadRequestException(
      `Файл «${originalName}»: содержимое не похоже на ${fileExtension(originalName).slice(1).toUpperCase()}`,
    );
  }
}

/**
 * Ключ объекта в бакете.
 *
 * Хеш в имени делает ключ уникальным ровно там же, где уникальность требует
 * база (`orderId + submissionRound + fileHash`), а транслитерированное имя
 * рядом — чтобы содержимое папки читалось глазами в панели Supabase.
 *
 * Функция лежит здесь, а не в сервисе: тот же ключ строит seed, а тянуть
 * ради этого в скрипт весь `FilesService` с базой и хранилищем незачем.
 */
export function buildStorageKey(
  orderId: string,
  ownerType: FileOwnerType,
  submissionRound: number,
  file: Pick<PreparedFile, 'fileHash' | 'safeName'>,
): string {
  const owner = ownerType.toLowerCase();
  return `orders/${orderId}/${owner}/${submissionRound}/${file.fileHash.slice(0, 16)}-${file.safeName}`;
}

/**
 * Определить тип файла по расширению и сверить с заявленным.
 *
 * Нераспознанный клиентом тип (`application/octet-stream`) допускается:
 * иначе DWG нельзя было бы загрузить из браузера вовсе. Подменённый —
 * нет: `.exe`, присланный как `application/pdf`, отсекается расширением,
 * а `.pdf` с типом `application/x-msdownload` — этой сверкой.
 */
export function resolveMimeType(
  originalName: string,
  declaredMimeType: string,
): AllowedFileMimeType {
  const extension = fileExtension(originalName);
  const expected = FILE_EXTENSION_MIME[extension];

  if (!expected) {
    throw new BadRequestException(
      `Файл «${originalName}»: такой тип загрузить нельзя. Разрешены ${ALLOWED_FILE_EXTENSIONS_HINT}`,
    );
  }

  // «application/pdf; charset=utf-8» — параметры после «;» нам не нужны.
  const declared = declaredMimeType.split(';')[0]!.trim().toLowerCase();

  if (UNKNOWN_MIME_TYPES.has(declared)) {
    return expected;
  }

  if (MIME_ALIASES[declared] !== expected) {
    throw new BadRequestException(
      `Файл «${originalName}»: тип «${declaredMimeType}» не совпадает с расширением «${extension}»`,
    );
  }

  return expected;
}

/**
 * Привести имя к ASCII-виду, пригодному для ключа в хранилище (ТЗ §6).
 *
 * Исходное имя не теряется — оно хранится в `OrderFile.originalName`
 * и подставляется в signed URL при скачивании.
 */
export function sanitizeFileName(originalName: string): string {
  // Путь отрезаем: Internet Explorer и часть загрузчиков присылают
  // «C:\Users\...\plan.pdf» целиком, а «/» и «..» в ключе — это выход
  // за пределы папки заказа.
  const baseName = (originalName.split(/[/\\]/).pop() ?? '').trim();
  const extension = fileExtension(baseName);
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;

  const transliterated = stem
    .toLowerCase()
    .replaceAll(/[а-яё]/g, (letter) => TRANSLIT[letter] ?? '');

  const safeStem = transliterated
    .replaceAll(/[^a-z0-9._-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '')
    .slice(0, MAX_SAFE_NAME_LENGTH);

  return `${safeStem || 'file'}${extension}`;
}
