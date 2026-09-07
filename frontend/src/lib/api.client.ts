import { apiFetch, type RequestOptions } from "./api";
import { currentSocketId } from "./socket";
import { getAccessToken } from "./supabase/client";

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
 *
 * К запросу добавляется идентификатор своего сокета: по нему backend не шлёт
 * этой же вкладке событие о её собственном действии (`common/actor-context.ts`
 * на сервере). Ответ мутации и так приносит свежий заказ, а событие стоило бы
 * ещё одного запроса.
 */
async function browserFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const socketId = currentSocketId();

  return apiFetch<T>(path, {
    ...options,
    token: await getAccessToken(),
    headers: {
      ...options.headers,
      ...(socketId ? { "X-Socket-Id": socketId } : {}),
    },
  });
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
