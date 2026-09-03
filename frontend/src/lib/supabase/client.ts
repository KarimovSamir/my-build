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
