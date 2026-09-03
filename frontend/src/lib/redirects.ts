/**
 * Куда возвращать пользователя после входа или подтверждения email.
 *
 * Адрес приходит из строки запроса, то есть от кого угодно. Пускаем только
 * относительные пути внутри приложения: иначе ссылка вида
 * `/login?next=https://зло.example` увела бы пользователя на чужой сайт
 * сразу после успешного входа (open redirect).
 */
export function safeNextPath(value: string | string[] | undefined, fallback = "/"): string {
  const path = Array.isArray(value) ? value[0] : value;

  if (!path) return fallback;

  // `//host` браузер считает адресом другого сайта, `/\host` — часть браузеров тоже.
  const isRelative = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");

  return isRelative ? path : fallback;
}
