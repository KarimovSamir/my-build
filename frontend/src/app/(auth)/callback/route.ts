import { NextResponse, type NextRequest } from "next/server";

import { landingAfterLink } from "@/lib/callback-link";
import { safeNextPath } from "@/lib/redirects";
import { isSignupConfirmation } from "@/lib/session";
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
 * Сам входит здесь только первый способ: обмен кода проходит лишь в браузере,
 * который запросил письмо (verifier лежит в его cookie), и чужую ссылку так
 * не подсунуть. Второй и третий способы входят под тем, чьи токены в ссылке,
 * в каком бы браузере её ни открыли, — поэтому они уходят на
 * `/callback/complete`: там человек видит, чья учётная запись откроется,
 * и входит кнопкой (login-CSRF, `lib/callback-link.ts`). Фрагмент к тому же
 * виден только браузеру — сервер его не получает вовсе.
 *
 * Успех первого способа — это сессия в cookie: её ставит route-обработчик.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next") ?? undefined);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // После подтверждения регистрации пароля у учётки нет — его стирает
      // база (`on_auth_user_signup_confirmed`), и первым делом его надо задать.
      const { data } = await supabase.auth.getClaims();
      const signupConfirmation = isSignupConfirmation(data?.claims?.amr);

      return NextResponse.redirect(
        new URL(landingAfterLink({ signupConfirmation }, next), request.url),
      );
    }
  } else if (!searchParams.has("error")) {
    // `token_hash` — или параметров нет вовсе, и токены, возможно, во
    // фрагменте: он переживает редирект, так что до браузера доедет.
    const complete = new URL("/callback/complete", request.url);
    complete.searchParams.set("next", next);
    if (tokenHash && type) {
      complete.searchParams.set("token_hash", tokenHash);
      complete.searchParams.set("type", type);
    }

    return NextResponse.redirect(complete);
  }

  // Ссылку уже использовали, она устарела или её обрезал почтовый клиент.
  const login = new URL("/login", request.url);
  login.searchParams.set("error", "link");

  return NextResponse.redirect(login);
}
