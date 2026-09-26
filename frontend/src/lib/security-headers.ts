/**
 * Заголовки безопасности всех страниц фронта. Подключаются в `next.config.ts`
 * через `headers()` и вычисляются при сборке — как и `NEXT_PUBLIC_*`, которые
 * в них попадают.
 *
 * Модуль без импортов через `@/`: его читает `next.config.ts`, а там алиасов
 * путей нет.
 *
 * Почему CSP без nonce. Nonce закрыл бы и встроенные скрипты, но Next.js
 * требует для него динамического рендера каждой страницы — лендинг и экраны
 * входа перестали бы отдаваться статикой. Политика ниже держит то, что nonce
 * не нужно: чужие скрипты не грузятся, страница не встраивается в чужой
 * фрейм, а запросы и картинки уходят только на свои адреса. Последнее важно
 * отдельно: cookie сессии `@supabase/ssr` читаются из JS, и внедрённый скрипт
 * не смог бы отправить токен ни запросом, ни картинкой.
 */

export interface SecurityHeadersEnv {
  /** `NEXT_PUBLIC_API_URL`. */
  apiUrl?: string;
  /** `NEXT_PUBLIC_WS_URL`. */
  wsUrl?: string;
  /** `NEXT_PUBLIC_SUPABASE_URL`. */
  supabaseUrl?: string;
  /** `next dev`: React в разработке пользуется `eval`. */
  dev: boolean;
}

export interface Header {
  key: string;
  value: string;
}

/**
 * Запасной адрес API — тот же, что в `lib/api.ts` и `lib/socket.ts`. Разойдись
 * они — сборка без переменных ходила бы туда, куда её политика не пускает.
 */
const LOCAL_API_URL = "http://localhost:4000";

export function contentSecurityPolicy(env: SecurityHeadersEnv): string {
  const apiUrl = env.apiUrl ?? LOCAL_API_URL;
  const wsUrl = env.wsUrl ?? apiUrl;

  const connect = new Set(["'self'", origin(apiUrl), origin(wsUrl), socketOrigin(wsUrl)]);

  if (env.supabaseUrl) {
    connect.add(origin(env.supabaseUrl));
  }

  const directives = [
    "default-src 'self'",
    // Встроенные скрипты — это данные гидратации Next.js и скрипт темы
    // `next-themes`; без nonce их не отличить от внедрённых (см. выше).
    `script-src 'self' 'unsafe-inline'${env.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // `blob:` — превью выбранных файлов в форме загрузки.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}

export function securityHeaders(env: SecurityHeadersEnv): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    // Для браузеров без `frame-ancestors`.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

function origin(url: string): string {
  return new URL(url).origin;
}

/** socket.io начинает с HTTP-опроса и переходит на WebSocket того же адреса. */
function socketOrigin(url: string): string {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed.origin;
}
