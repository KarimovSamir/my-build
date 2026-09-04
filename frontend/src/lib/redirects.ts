/**
 * Куда возвращать пользователя после входа или подтверждения email.
 *
 * Адрес приходит из строки запроса, то есть от кого угодно. Пускаем только
 * относительные пути внутри приложения: иначе ссылка вида
 * `/login?next=https://зло.example` увела бы пользователя на чужой сайт
 * сразу после успешного входа (open redirect).
 */

/**
 * Символы, которые разбор адреса выбрасывает из любого места строки.
 *
 * Это не придирка к экзотике: `/\t/host` начинается с одной косой черты и любую
 * проверку «начинается с `/`, но не с `//`» проходит, а `new URL` и адресная
 * строка браузера видят уже `//host`, то есть чужой сайт.
 */
const STRIPPED_ANYWHERE = /[\t\n\r]/g;

/**
 * Наибольший код символа, который разбор адреса срезает по краям строки:
 * пробел и всё, что младше. Поэтому « //host» — это тот же «//host».
 */
const EDGE_CHAR_MAX_CODE = 0x20;

/** Срезать по краям то же, что срежет разбор адреса. */
function trimEdges(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value.charCodeAt(start) <= EDGE_CHAR_MAX_CODE) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= EDGE_CHAR_MAX_CODE) end -= 1;

  return value.slice(start, end);
}

export function safeNextPath(value: string | string[] | undefined, fallback = "/"): string {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) return fallback;

  // Проверять надо ровно ту строку, которую увидит браузер, а не ту, что пришла
  // в параметре: иначе фильтр смотрит на один адрес, а переход идёт по другому.
  const path = trimEdges(raw.replaceAll(STRIPPED_ANYWHERE, ""));

  // `//host` браузер считает адресом другого сайта, `/\host` — часть браузеров тоже.
  const isRelative = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");

  // Наружу уходит нормализованный путь: вернуть исходный значило бы проверить
  // одно, а отдать другое.
  return isRelative ? path : fallback;
}
