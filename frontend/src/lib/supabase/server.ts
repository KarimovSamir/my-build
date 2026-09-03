import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseCredentials } from "./env";

/**
 * Клиент Supabase для серверных компонентов и route-обработчиков.
 *
 * Создаётся заново на каждый запрос: один клиент на всех означал бы, что
 * сессия одного пользователя видна другому.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const store = await cookies();
  const { url, key } = supabaseCredentials();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Из серверного компонента cookie менять нельзя — ответ уже начал
          // рендериться. Обновлённую сессию запишет proxy.ts, он ходит
          // на каждый запрос раньше рендера.
        }
      },
    },
  });
}
