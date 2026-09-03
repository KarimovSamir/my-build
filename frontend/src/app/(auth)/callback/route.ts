import { NextResponse, type NextRequest } from "next/server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { safeNextPath } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Обработка ссылок из писем Supabase: подтверждение email и сброс пароля
 * (ТЗ §5, §7).
 *
 * Supabase отвечает на такую ссылку одним из трёх способов, и все три
 * встречаются на живом проекте:
 *
 * 1. `?code=` — обмен по PKCE. Так приходит письмо, отправленное после
 *    регистрации из нашей формы.
 * 2. `?token_hash=&type=` — одноразовый токен. Так получается, когда шаблон
 *    письма собран вручную.
 * 3. `#access_token=…` — токены во фрагменте. Так отвечают ссылки, выданные
 *    Admin API: приглашения и всё, что отправлено из панели Supabase.
 *
 * Третий случай сервер увидеть не может — фрагмент браузер не отправляет.
 * Поэтому запрос без узнаваемых параметров уходит на `/callback/complete`,
 * где фрагмент разбирает браузер. Без этого такие ссылки молча приводили бы
 * на экран «ссылка не сработала».
 *
 * Успех — это сессия в cookie: их ставит route-обработчик, а не браузер.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next") ?? undefined);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  } else if (!searchParams.has("error")) {
    // Параметров нет вовсе — возможно, токены во фрагменте. Фрагмент
    // переживает редирект, так что до браузера он доедет.
    const complete = new URL("/callback/complete", request.url);
    complete.searchParams.set("next", next);

    return NextResponse.redirect(complete);
  }

  // Ссылку уже использовали, она устарела или её обрезал почтовый клиент.
  const login = new URL("/login", request.url);
  login.searchParams.set("error", "link");

  return NextResponse.redirect(login);
}
