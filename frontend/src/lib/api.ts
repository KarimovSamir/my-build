import type { ApiError } from "@/lib/types";

/**
 * Типизированный клиент к NestJS API.
 *
 * Транспорт и обработка ошибок, без знания о том, откуда берётся токен: его
 * передают явно. На сервере это делает `api.server.ts`; браузерная обёртка
 * появится в Фазе 3, когда из браузера начнут ходить запросы. Так один и тот
 * же модуль работает по обе стороны и не тащит за собой `next/headers`.
 *
 * Прямых обращений к Supabase за данными здесь не будет никогда — всё идёт
 * через наш API (ТЗ §2).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Сколько ждать ответа, прежде чем оборвать запрос.
 *
 * Без предела повисший запрос держит серверный рендер до таймаута площадки,
 * и страница выглядит не ошибкой, а бесконечной загрузкой: ни границы ошибок,
 * ни понятного текста. Предел взят с запасом — бесплатный Render просыпается
 * не мгновенно, — но конечный: честная ошибка лучше зависшей вкладки.
 *
 * У загрузки файлов свой: 50 МБ на медленном канале идут дольше любого ответа.
 */
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Ошибка API в виде исключения — с кодом и разобранным телом ответа. */
export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly body: ApiError | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** Сообщения валидации отдельным списком — форме удобнее показывать их по полям. */
  get validationMessages(): string[] {
    const message = this.body?.message;
    if (Array.isArray(message)) return message;
    return message ? [message] : [];
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Тело запроса. Объект уйдёт как JSON, FormData — как есть (загрузка файлов). */
  body?: unknown;
  /** Параметры строки запроса. Пустые значения отбрасываются. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Access-токен Supabase. Без него запрос уйдёт без заголовка Authorization. */
  token?: string | null;
  /** Своё ожидание ответа в миллисекундах. `0` — ждать сколько угодно. */
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), `${API_URL.replace(/\/$/, "")}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function parseError(response: Response): Promise<ApiRequestError> {
  let body: ApiError | null = null;

  try {
    body = (await response.json()) as ApiError;
  } catch {
    // Тело может быть пустым или не-JSON — тогда опираемся только на статус.
  }

  const message = Array.isArray(body?.message)
    ? body.message.join(", ")
    : (body?.message ?? `Запрос завершился с кодом ${response.status}`);

  return new ApiRequestError(response.status, message, body);
}

/**
 * Ожидание ответа поверх сигнала вызывающего кода, если тот его передал.
 * `AbortSignal.any` сохраняет обе причины отмены — своя не отменяет чужую.
 */
function withTimeout(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal | null | undefined {
  if (timeoutMs <= 0) return signal;

  const limit = AbortSignal.timeout(timeoutMs);

  return signal ? AbortSignal.any([signal, limit]) : limit;
}

/**
 * Истёкшее ожидание — такой же ответ API, как и код состояния: пользователю
 * нужен текст, а не `TimeoutError` из недр fetch. 504 выбран, чтобы ошибка
 * шла обычным путём `api-errors.ts` и не путалась с 401.
 *
 * Причина смотрится и в сигнале: не всякая реализация fetch отклоняет обещание
 * именно этой ошибкой, а `AbortSignal.any` причину отмены сохраняет.
 */
function isTimeout(error: unknown, signal: AbortSignal | null | undefined): boolean {
  if (error instanceof Error && error.name === "TimeoutError") return true;

  const reason: unknown = signal?.aborted ? signal.reason : null;

  return reason instanceof Error && reason.name === "TimeoutError";
}

export async function apiFetch<T>(
  path: string,
  { body, query, headers, token, timeoutMs, signal, ...init }: RequestOptions = {},
): Promise<T> {
  const isFormData = body instanceof FormData;

  const request = {
    ...init,
    signal: withTimeout(signal, timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)),
    headers: {
      ...(isFormData ? {} : body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), request);
  } catch (error) {
    if (isTimeout(error, request.signal)) {
      throw new ApiRequestError(504, "Сервер не ответил вовремя. Попробуйте ещё раз", null);
    }

    throw error;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
