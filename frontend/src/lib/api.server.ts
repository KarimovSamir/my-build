import "server-only";

import { apiFetch, type RequestOptions } from "./api";
import { getAccessToken } from "./session.server";

/**
 * Запросы к нашему API из серверных компонентов и route-обработчиков.
 *
 * Токен подставляется из сессии Supabase, лежащей в httpOnly-cookie: сам
 * вызывающий код о нём не знает и забыть его не может.
 *
 * Ответы не кэшируются: всё, что здесь запрашивается, — данные конкретного
 * пользователя, и общий кэш отдал бы их чужому.
 */
async function serverFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiFetch<T>(path, {
    cache: "no-store",
    ...options,
    token: await getAccessToken(),
  });
}

export const serverApi = {
  get: <T>(path: string, options?: RequestOptions) =>
    serverFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    serverFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    serverFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    serverFetch<T>(path, { ...options, method: "DELETE" }),
};
