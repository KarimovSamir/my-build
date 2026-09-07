import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseCredentials } from "./env";

/**
 * Клиент Supabase для браузера.
 *
 * Через него идёт только авторизация — вход, регистрация, выход, смена пароля
 * (ТЗ §5). Данные приложения запрашиваются исключительно у нашего API.
 *
 * Клиент один на вкладку: каждый новый заводит свой таймер обновления токена
 * и свою подписку на события, и они начинают мешать друг другу.
 */
let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, key } = supabaseCredentials();
    browserClient = createBrowserClient(url, key);
  }

  return browserClient;
}

/**
 * Access-токен текущей сессии.
 *
 * Живёт рядом с клиентом, а не в `api.client.ts`, потому что нужен не только
 * запросам: тем же токеном авторизуется сокет (`lib/socket.ts`, ТЗ §8), а тот,
 * в свою очередь, нужен запросам — и через `api.client` вышел бы круг импортов.
 *
 * `getSession` отдаёт уже обновлённый токен: SDK следит за сроком сам.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();

  return data.session?.access_token ?? null;
}
