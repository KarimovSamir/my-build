/**
 * Проверка и нормализация загружаемых файлов (ТЗ §5, §6).
 *
 * Здесь нет ни базы, ни хранилища — чистые функции, поэтому все правила
 * проверяются unit-тестами без сети.
 */

import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  MAX_FILE_SIZE_BYTES,
  type AllowedFileMimeType,
} from '@mybuild/shared';

/** Файл, пришедший на загрузку. Форма своя, не multer'овская: сервис не должен зависеть от транспорта. */
export interface UploadedFileInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
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
  buffer: Buffer;
}

/**
 * Расширение → тип, который мы записываем в базу.
 *
 * Расширение здесь главнее заголовка запроса: браузеры для DWG/DXF в половине
 * случаев присылают `application/octet-stream`, а для остальных типов
 * заголовок легко подделать. Так в `mimeType` всегда лежит одно из значений
 * allowlist'а, а не то, что назвал клиент.
 */
export const EXTENSION_MIME: Record<string, AllowedFileMimeType> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.dwg': 'image/vnd.dwg',
  '.dxf': 'application/dxf',
};

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

const ALLOWED_EXTENSIONS_HINT = 'PDF, DWG, DXF, PNG, JPEG, WEBP';

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
 * Проверить файл и посчитать всё, что нужно для записи.
 * Бросает 400 на недопустимый тип и 413 на превышение размера.
 */
export function prepareFile(file: UploadedFileInput): PreparedFile {
  // Размер берём по содержимому, а не по тому, что заявил клиент.
  const sizeBytes = file.buffer.byteLength;

  if (sizeBytes === 0) {
    throw new BadRequestException(`Файл «${file.originalName}» пустой`);
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      `Файл «${file.originalName}» больше ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`,
    );
  }

  return {
    originalName: file.originalName,
    safeName: sanitizeFileName(file.originalName),
    mimeType: resolveMimeType(file.originalName, file.mimeType),
    sizeBytes,
    fileHash: createHash('sha256').update(file.buffer).digest('hex'),
    buffer: file.buffer,
  };
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
  const extension = extractExtension(originalName);
  const expected = EXTENSION_MIME[extension];

  if (!expected) {
    throw new BadRequestException(
      `Файл «${originalName}»: такой тип загрузить нельзя. Разрешены ${ALLOWED_EXTENSIONS_HINT}`,
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
  const extension = extractExtension(baseName);
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

/**
 * Расширение в нижнем регистре, вместе с точкой. Пустая строка, если его нет.
 * Пробелы по краям отрезаются: иначе «plan.pdf » дало бы расширение «.pdf ».
 */
function extractExtension(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  return dot > 0 ? trimmed.slice(dot).toLowerCase() : '';
}
