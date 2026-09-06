import { apiFetch, type RequestOptions } from "./api";
import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * Запросы к нашему API из браузера.
 *
 * Зеркало `api.server.ts`: тот берёт токен из httpOnly-cookie на сервере, этот —
 * из сессии Supabase в браузере. Вызывающий код о токене не знает и забыть его
 * не может.
 *
 * Нужен там, где серверного рендера не хватает: форма создания заказа шлёт
 * multipart с файлами прямо из браузера, чтобы не гонять их лишний раз через
 * процесс Next.js.
 */
async function browserFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiFetch<T>(path, { ...options, token: await getAccessToken() });
}

/**
 * Access-токен текущей сессии. Отдельной функцией, потому что нужен не только
 * запросам: тем же токеном авторизуется сокет (`lib/socket.ts`, ТЗ §8).
 *
 * `getSession` отдаёт уже обновлённый токен: SDK следит за сроком сам.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();

  return data.session?.access_token ?? null;
}

export const browserApi = {
  get: <T>(path: string, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    browserFetch<T>(path, { ...options, method: "DELETE" }),
};
