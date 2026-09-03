import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Role } from "@mybuild/shared";

import { readRoleClaim } from "../session";
import { supabaseCredentials } from "./env";

export interface ProxySession {
  /** Ответ с обновлёнными cookie сессии. Возвращать нужно именно его. */
  response: NextResponse;
  userId: string | null;
  role: Role | null;
}

/**
 * Обновление сессии Supabase на каждом запросе (ТЗ §10, Фаза 2).
 *
 * Access-токен живёт час, и продлевать его должен сервер: иначе вкладка,
 * открытая утром, к обеду начнёт получать 401 от нашего API.
 *
 * Подпись токена проверяется локально по JWKS (`getClaims`), поэтому proxy
 * не ходит в Supabase на каждый запрос и остаётся быстрым.
 */
export async function updateSession(request: NextRequest): Promise<ProxySession> {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseCredentials();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // Ответ с cookie сессии не должен попасть в общий кэш CDN:
        // иначе токен одного пользователя уедет другому.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  return {
    response,
    userId: typeof claims?.sub === "string" ? claims.sub : null,
    role: readRoleClaim(claims?.user_role),
  };
}
