import type { ApiError } from "@mybuild/shared";

/**
 * Типизированный клиент к NestJS API.
 *
 * Фаза 0 — транспорт и обработка ошибок. Access-токен пока никто не выдаёт:
 * в Фазе 2 сюда подставится токен Supabase, и место для этого уже размечено
 * (`getAccessToken`). Прямых обращений к Supabase за данными здесь не будет
 * никогда — всё идёт через наш API (ТЗ §2).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

/**
 * Источник access-токена.
 *
 * В Фазе 2 сюда подставится сессия Supabase. Пока возвращает null —
 * запросы уходят без заголовка Authorization.
 */
let getAccessToken: () => Promise<string | null> = async () => null;

export function setAccessTokenProvider(
  provider: () => Promise<string | null>,
): void {
  getAccessToken = provider;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Тело запроса. Объект уйдёт как JSON, FormData — как есть (загрузка файлов). */
  body?: unknown;
  /** Параметры строки запроса. Пустые значения отбрасываются. */
  query?: Record<string, string | number | boolean | undefined | null>;
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

export async function apiFetch<T>(
  path: string,
  { body, query, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const token = await getAccessToken();
  const isFormData = body instanceof FormData;

  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      ...(isFormData ? {} : body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

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
